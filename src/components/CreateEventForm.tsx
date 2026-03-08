"use client";

import { useEffect, useState } from "react";
import CityAutocomplete from "@/src/components/CityAutocomplete";
import { isValidCity, normalizeCity } from "@/src/lib/cities";
import {
  combineDateAndTimeToISO,
  splitISOToDateAndTime,
  TIME_OPTIONS,
} from "@/src/lib/dateTimeSlots";
import {
  CONTACT_METHOD_OPTIONS_WITH_COMMUNICATION,
  CONTACT_VISIBILITY_OPTIONS,
  type ContactMethod,
  type ContactVisibility,
} from "@/src/lib/contactMethods";
import {
  CATEGORY_OPTIONS,
  CATEGORY_GROUPS,
  getCategoryDisplay,
  type EventCategory,
} from "@/src/lib/eventCategories";

type LatLng = { lat: number; lng: number };

type FormErrors = {
  city?: string;
  customName?: string;
  customCategoryTitle?: string;
  address?: string;
  date?: string;
  contactMethod?: string;
  whatsappInviteUrl?: string;
  location?: string;
};

type CreateEventFormProps = {
  pickedLatLng: LatLng | null;
  onPickedLatLngChange: (value: LatLng) => void;
  onCityChange?: (city: string) => void;
  onSubmitSuccess: () => void;
  submitMode?: "create" | "edit";
  submitUrl?: string;
  submitButtonLabel?: string;
  initialValues?: {
    category?: EventCategory;
    customName?: string;
    customCategoryTitle?: string;
    city?: string;
    address?: string;
    description?: string;
    contactMethod?: ContactMethod;
    contactVisibility?: ContactVisibility;
    whatsappInviteUrl?: string;
    autoApprove?: boolean;
    dateISO?: string;
  } | null;
};

function validateCity(city: string): string | undefined {
  if (!city.trim()) {
    return undefined;
  }
  if (!isValidCity(city)) {
    return "Please choose a city from the list.";
  }
  return undefined;
}

function validateDateAndTime(datePart: string, timePart: string): string | undefined {
  if (!datePart && !timePart) {
    return undefined;
  }

  if (!datePart || !timePart) {
    return "Choose both date and time.";
  }

  const parsed = new Date(`${datePart}T${timePart}`);
  if (Number.isNaN(parsed.getTime())) {
    return "Date and time must be valid.";
  }

  return undefined;
}

function validateAddress(address: string): string | undefined {
  if (address.length > 120) {
    return "Address must be 120 characters or less.";
  }
  return undefined;
}

function validateLocation(pickedLatLng: LatLng | null): string | undefined {
  if (!pickedLatLng) {
    return undefined;
  }
  return undefined;
}

function validateWhatsappInviteUrl(
  contactMethod: ContactMethod,
  whatsappInviteUrl: string,
): string | undefined {
  if (contactMethod !== "WHATSAPP_GROUP") {
    return undefined;
  }

  const trimmed = whatsappInviteUrl.trim();
  if (!trimmed) {
    return "WhatsApp invite link is required.";
  }

  const isValidPrefix =
    trimmed.startsWith("https://chat.whatsapp.com/") ||
    trimmed.startsWith("https://wa.me/");

  if (!isValidPrefix) {
    return "Link must start with https://chat.whatsapp.com/ or https://wa.me/";
  }

  return undefined;
}

export default function CreateEventForm({
  pickedLatLng,
  onPickedLatLngChange,
  onCityChange,
  onSubmitSuccess,
  submitMode = "create",
  submitUrl,
  submitButtonLabel,
  initialValues,
}: CreateEventFormProps) {
  const [customName, setCustomName] = useState("");
  const [city, setCity] = useState("");
  const [citySelected, setCitySelected] = useState(false);
  const [category, setCategory] = useState<EventCategory>("COFFEE");
  const [customCategoryTitle, setCustomCategoryTitle] = useState("");
  const [address, setAddress] = useState("");
  const [datePart, setDatePart] = useState("");
  const [timePart, setTimePart] = useState("");
  const [description, setDescription] = useState("");
  const [contactMethod, setContactMethod] =
    useState<ContactMethod>("ORGANIZER_PHONE");
  const [contactVisibility, setContactVisibility] =
    useState<ContactVisibility>("SIGNED_IN_ONLY");
  const [autoApprove, setAutoApprove] = useState(false);
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const categoryDisplay = getCategoryDisplay(
    category,
    category === "OTHER" ? customCategoryTitle : undefined,
  );
  const featuredCategoryValues: EventCategory[] = [
    "COFFEE",
    "SOCCER",
    "BASKETBALL",
    "GYM",
    "RUNNING",
    "VOLLEYBALL",
  ];
  const generatedTitle = city.trim()
    ? `${categoryDisplay.label} in ${city.trim()}`
    : `${categoryDisplay.label} event`;
  const finalTitle = customName.trim() || generatedTitle;
  const resolvedSubmitMethod = submitMode === "edit" ? "PUT" : "POST";
  const resolvedSubmitUrl = submitUrl ?? "/api/events";
  const resolvedSubmitLabel =
    submitButtonLabel ?? (submitMode === "edit" ? "Save Changes" : "Save Event");

  useEffect(() => {
    if (!initialValues) {
      return;
    }

    setCategory(initialValues.category ?? "COFFEE");
    setCustomName(initialValues.customName ?? "");
    setCustomCategoryTitle(initialValues.customCategoryTitle ?? "");
    setCity(initialValues.city ?? "");
    setCitySelected(Boolean(initialValues.city));
    setAddress(initialValues.address ?? "");
    setDescription(initialValues.description ?? "");
    setContactMethod(
      initialValues.contactMethod === "NONE"
        ? "ORGANIZER_PHONE"
        : (initialValues.contactMethod ?? "ORGANIZER_PHONE"),
    );
    setContactVisibility(initialValues.contactVisibility ?? "SIGNED_IN_ONLY");
    setWhatsappInviteUrl(initialValues.whatsappInviteUrl ?? "");
    setAutoApprove(Boolean(initialValues.autoApprove));
    const { datePart: initialDatePart, timePart: initialTimePart } =
      splitISOToDateAndTime(initialValues.dateISO);
    setDatePart(initialDatePart);
    setTimePart(initialTimePart);
    onCityChange?.(initialValues.city ?? "");
  }, [initialValues, onCityChange]);

  const getFriendlySubmitError = async (response: Response) => {
    const rawText = await response.text().catch(() => "");
    let parsed: { error?: string } | null = null;

    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as { error?: string };
      } catch {
        parsed = null;
      }
    }

    if (parsed?.error) {
      return parsed.error;
    }

    if (response.status === 401) {
      return `You need to sign in before ${submitMode === "edit" ? "editing" : "creating"} an event.`;
    }

    if (response.status === 403) {
      return `You are not allowed to ${submitMode === "edit" ? "edit" : "create"} this event.`;
    }

    if (response.status === 400) {
      return "Some event details are invalid. Please review the form and try again.";
    }

    if (rawText.trim()) {
      return `Request failed (${response.status}): ${rawText.slice(0, 180)}`;
    }

    return `Request failed with status ${response.status}.`;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitError(null);

    const nextErrors: FormErrors = {
      city:
        !citySelected && city.trim().length > 0
          ? "Please choose a city from the list."
          : validateCity(city),
      customName:
        customName.trim().length > 0 && customName.trim().length < 2
          ? "Custom name must be at least 2 characters."
          : undefined,
      customCategoryTitle:
        category === "OTHER" && customCategoryTitle.trim().length < 2
          ? "Please enter a title for the Other category."
          : undefined,
      address: validateAddress(address),
      date: validateDateAndTime(datePart, timePart),
      contactMethod: undefined,
      whatsappInviteUrl: validateWhatsappInviteUrl(
        contactMethod,
        whatsappInviteUrl,
      ),
      location: validateLocation(pickedLatLng),
    };

    const hasAnyLocationInput =
      Boolean(pickedLatLng) ||
      (Boolean(city.trim()) && citySelected && !validateCity(city)) ||
      Boolean(address.trim());
    if (!hasAnyLocationInput) {
      nextErrors.location = "Add address, city, or choose a point on the map.";
    }

    if (contactMethod === "NONE") {
      nextErrors.contactMethod =
        "Please choose a contact method so participants can reach out.";
    }

    const hasError = Boolean(
      nextErrors.city ||
        nextErrors.customName ||
        nextErrors.customCategoryTitle ||
        nextErrors.address ||
        nextErrors.date ||
        nextErrors.contactMethod ||
        nextErrors.whatsappInviteUrl ||
        nextErrors.location,
    );
    if (hasError) {
      setErrors(nextErrors);
      return;
    }

    const dateISO = combineDateAndTimeToISO(datePart, timePart);
    setIsSubmitting(true);

    try {
      const response = await fetch(resolvedSubmitUrl, {
        method: resolvedSubmitMethod,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: finalTitle,
          city: city.trim(),
          category,
          customCategoryTitle:
            category === "OTHER" ? customCategoryTitle.trim() : undefined,
          address: address.trim() || undefined,
          description: description.trim() || undefined,
          dateISO,
          contactMethod,
          contactVisibility,
          autoApprove,
          whatsappInviteUrl:
            contactMethod === "WHATSAPP_GROUP"
              ? whatsappInviteUrl.trim()
              : undefined,
          lat: pickedLatLng?.lat,
          lng: pickedLatLng?.lng,
        }),
      });

      if (!response.ok) {
        setSubmitError(await getFriendlySubmitError(response));
        return;
      }

      setErrors({});
      onSubmitSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown network error";
      setSubmitError(
        `Could not reach the server. Check your connection and try again. (${message})`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const geocodeAddress = async () => {
    const trimmed = address.trim();
    if (trimmed.length < 3) {
      setGeocodeMessage(null);
      return;
    }

    setIsGeocoding(true);
    setGeocodeMessage(null);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        method: "GET",
      });

      if (!response.ok) {
        setGeocodeMessage("Address not found. Try a more specific address.");
        return;
      }

      const data = (await response.json()) as {
        lat?: number;
        lng?: number;
        displayName?: string;
      };

      if (
        typeof data.lat !== "number" ||
        typeof data.lng !== "number" ||
        !Number.isFinite(data.lat) ||
        !Number.isFinite(data.lng)
      ) {
        setGeocodeMessage("Address not found. Try a more specific address.");
        return;
      }

      onPickedLatLngChange({ lat: data.lat, lng: data.lng });
      if (typeof data.displayName === "string" && data.displayName.trim()) {
        const displayName = data.displayName.trim();
        setAddress(displayName.slice(0, 120));

        const segments = displayName
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean);
        const extractedCityCandidate =
          segments.find((segment) => isValidCity(segment)) ?? null;
        const extractedCity = extractedCityCandidate
          ? normalizeCity(extractedCityCandidate)
          : null;
        if (extractedCity) {
          setCity(extractedCity);
          setCitySelected(true);
          onCityChange?.(extractedCity);
        }
      }
      setGeocodeMessage("Location found on map");
    } catch {
      setGeocodeMessage("Address not found. Try a more specific address.");
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm transition hover:shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Live Preview
        </p>
        <p className="mt-2 text-xl font-bold text-gray-900">
          {categoryDisplay.emoji} {finalTitle}
        </p>
        <div className="mt-3 space-y-1 text-sm text-gray-700">
          <p>📍 {city.trim() || "Choose a city or map location"}</p>
          <p>
            🕒{" "}
            {datePart && timePart
              ? new Date(`${datePart}T${timePart}`).toLocaleString()
              : "Not set yet"}
          </p>
          <p>
            👥{" "}
            {autoApprove
              ? "Anyone can join"
              : "Request to join (organizer approval required)"}
          </p>
        </div>
      </div>

      <section className="ui-card space-y-4">
        <h3 className="section-title text-lg">Activity</h3>

        <div className="space-y-2">
          <p className="label-base mb-0">Quick categories</p>
          <div className="flex flex-wrap gap-2">
            {featuredCategoryValues.map((value) => {
              const option = CATEGORY_OPTIONS.find((item) => item.value === value);
              if (!option) {
                return null;
              }
              const isActive = category === option.value;

              return (
                <button
                  className={[
                    "cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-indigo-100",
                  ].join(" ")}
                  key={option.value}
                  onClick={() => {
                    setCategory(option.value);
                    if (option.value !== "OTHER") {
                      setCustomCategoryTitle("");
                    }
                  }}
                  type="button"
                >
                  {option.emoji} {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label-base" htmlFor="category">
            All categories
          </label>
          <select
            className="input-base"
            id="category"
            onChange={(e) => {
              const nextCategory = e.target.value as EventCategory;
              setCategory(nextCategory);
              if (nextCategory !== "OTHER") {
                setCustomCategoryTitle("");
              }
            }}
            value={category}
          >
            {CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.emoji} {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {category === "OTHER" ? (
          <div>
            <label className="label-base" htmlFor="customCategoryTitle">
              Other category title
            </label>
            <input
              className="input-base"
              id="customCategoryTitle"
              maxLength={60}
              onChange={(e) => setCustomCategoryTitle(e.target.value)}
              placeholder="Enter category title"
              type="text"
              value={customCategoryTitle}
            />
            {errors.customCategoryTitle ? (
              <p className="mt-1 text-sm text-red-600">{errors.customCategoryTitle}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="label-base" htmlFor="customName">
            Custom name (optional)
          </label>
          <input
            className="input-base"
            id="customName"
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Leave empty to generate a name automatically"
            type="text"
            value={customName}
          />
          {errors.customName ? (
            <p className="mt-1 text-sm text-red-600">{errors.customName}</p>
          ) : null}
        </div>
      </section>

      <section className="ui-card space-y-4">
        <h3 className="section-title text-lg">Location</h3>
        <p className="text-xs text-gray-600">
          Use address, city, or map point. At least one is required.
        </p>
        <div>
          <CityAutocomplete
            label="City"
            onChange={(nextCity) => {
              setCity(nextCity);
              onCityChange?.(nextCity);
            }}
            onSelectionChange={setCitySelected}
            placeholder="Search city (optional)"
            selected={citySelected}
            value={city}
          />
          <p className="mt-1 text-xs text-gray-500">
            You can leave this empty if you choose the location on the map.
          </p>
          {errors.city ? <p className="mt-1 text-sm text-red-600">{errors.city}</p> : null}
        </div>
        <div>
          <label className="label-base" htmlFor="address">
            Address / place (optional)
          </label>
          <input
            className="input-base"
            id="address"
            maxLength={120}
            placeholder="Park, street, cafe, forest, trail..."
            onBlur={() => {
              void geocodeAddress();
            }}
            onChange={(e) => {
              setAddress(e.target.value);
              setGeocodeMessage(null);
            }}
            type="text"
            value={address}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              className="btn-secondary !rounded-lg !px-3 !py-1.5"
              disabled={isGeocoding}
              onClick={() => {
                void geocodeAddress();
              }}
              type="button"
            >
              Find Address
            </button>
            {isGeocoding ? <span className="text-sm text-gray-600">Finding...</span> : null}
          </div>
          {errors.address ? (
            <p className="mt-1 text-sm text-red-600">{errors.address}</p>
          ) : null}
          {geocodeMessage ? (
            <p
              className={
                geocodeMessage === "Location found on map"
                  ? "mt-1 text-sm text-green-700"
                  : "mt-1 text-sm text-red-600"
              }
            >
              {geocodeMessage}
            </p>
          ) : null}
        </div>
      </section>

      <section className="ui-card space-y-4">
        <h3 className="section-title text-lg">Date & Time</h3>
        <p className="text-xs text-gray-600">Choose a date and a start time.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-base" htmlFor="date">
              Date
            </label>
            <input
              className="input-base"
              id="date"
              onChange={(e) => setDatePart(e.target.value)}
              type="date"
              value={datePart}
            />
          </div>
          <div>
            <label className="label-base" htmlFor="time">
              Time
            </label>
            <select
              className="input-base"
              id="time"
              onChange={(e) => setTimePart(e.target.value)}
              value={timePart}
            >
              <option value="">Select time</option>
              {TIME_OPTIONS.map((timeValue) => (
                <option key={timeValue} value={timeValue}>
                  {timeValue}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Time can be selected only in 15-minute increments.
        </p>
        {errors.date ? <p className="text-sm text-red-600">{errors.date}</p> : null}
      </section>

      <section className="ui-card space-y-4">
        <h3 className="section-title text-lg">Details</h3>

        <div>
          <label className="label-base" htmlFor="description">
            Description
          </label>
          <textarea
            className="input-base"
            id="description"
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            value={description}
          />
        </div>

        <div>
          <label className="label-base" htmlFor="contactMethod">
            Contact method
          </label>
          <select
            className="input-base"
            id="contactMethod"
            onChange={(e) => {
              const value = e.target.value as ContactMethod;
              setContactMethod(value);
              if (value !== "WHATSAPP_GROUP") {
                setWhatsappInviteUrl("");
              }
            }}
            value={contactMethod}
          >
            {CONTACT_METHOD_OPTIONS_WITH_COMMUNICATION.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.contactMethod ? (
            <p className="mt-1 text-sm text-red-600">{errors.contactMethod}</p>
          ) : null}
        </div>

        {contactMethod === "WHATSAPP_GROUP" ? (
          <div>
            <label className="label-base" htmlFor="whatsappInviteUrl">
              WhatsApp group invite link
            </label>
            <input
              className="input-base"
              id="whatsappInviteUrl"
              onChange={(e) => setWhatsappInviteUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              type="url"
              value={whatsappInviteUrl}
            />
          </div>
        ) : null}

        {contactMethod === "ORGANIZER_PHONE" ? (
          <p className="text-xs text-gray-600">
            Make sure you added your phone in Settings.
          </p>
        ) : null}

        <div>
          <label className="label-base" htmlFor="contactVisibility">
            Contact visibility
          </label>
          <select
            className="input-base"
            id="contactVisibility"
            onChange={(e) =>
              setContactVisibility(e.target.value as ContactVisibility)
            }
            value={contactVisibility}
          >
            {CONTACT_VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {errors.whatsappInviteUrl ? (
          <p className="text-sm text-red-600">{errors.whatsappInviteUrl}</p>
        ) : null}
      </section>

      <section className="ui-card space-y-4">
        <h3 className="section-title text-lg">Join policy</h3>
        <div>
          <label className="label-base" htmlFor="joinPolicy">
            Who can join
          </label>
          <select
            className="input-base"
            id="joinPolicy"
            onChange={(event) => {
              setAutoApprove(event.target.value === "ANYONE");
            }}
            value={autoApprove ? "ANYONE" : "REQUEST"}
          >
            <option value="ANYONE">Anyone can join</option>
            <option value="REQUEST">
              Request to join (organizer approval required)
            </option>
          </select>
        </div>
      </section>

      {errors.location ? <p className="text-sm text-red-600">{errors.location}</p> : null}

      <button
        className="w-full rounded-xl bg-indigo-600 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-indigo-700"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving..." : resolvedSubmitLabel}
      </button>
      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
    </form>
  );
}
