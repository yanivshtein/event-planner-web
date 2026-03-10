"use client";

import { useEffect, useState, type ReactNode } from "react";
import CityAutocomplete from "@/src/components/CityAutocomplete";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
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
  onCancel?: () => void;
  mapSlot?: ReactNode;
  onSubmitSuccess: () => void;
  preferredQuickCategories?: EventCategory[];
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
  if (!datePart) {
    return "Please select a date for the event.";
  }

  const parsed = new Date(timePart ? `${datePart}T${timePart}` : `${datePart}T23:59:59.999`);
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
  onCancel,
  mapSlot,
  onSubmitSuccess,
  preferredQuickCategories,
  submitMode = "create",
  submitUrl,
  submitButtonLabel,
  initialValues,
}: CreateEventFormProps) {
  const renderRequiredMark = () => (
    <>
      <span aria-hidden="true" className="ml-1 text-red-600">
        *
      </span>
      <span className="sr-only">required</span>
    </>
  );
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
  const defaultQuickCategoryValues: EventCategory[] = [
    "COFFEE",
    "SOCCER",
    "BASKETBALL",
    "GYM",
    "RUNNING",
    "VOLLEYBALL",
  ];
  const featuredCategoryValues = (() => {
    const ordered = [
      ...(preferredQuickCategories ?? []),
      ...defaultQuickCategoryValues,
    ];
    const deduped: EventCategory[] = [];
    for (const value of ordered) {
      if (value === "OTHER" || deduped.includes(value)) {
        continue;
      }
      deduped.push(value);
    }
    return deduped.slice(0, 8);
  })();
  const hasPreferredQuickCategories = Boolean(preferredQuickCategories?.length);
  const cityErrorForState =
    !citySelected && city.trim().length > 0
      ? "Please choose a city from the list."
      : validateCity(city);
  const customNameErrorForState =
    customName.trim().length > 0 && customName.trim().length < 2
      ? "Custom name must be at least 2 characters."
      : undefined;
  const customCategoryTitleErrorForState =
    category === "OTHER" && customCategoryTitle.trim().length < 2
      ? "Please enter a title for the Other category."
      : undefined;
  const dateErrorForState = validateDateAndTime(datePart, timePart);
  const whatsappErrorForState = validateWhatsappInviteUrl(
    contactMethod,
    whatsappInviteUrl,
  );
  const hasAnyLocationInput =
    Boolean(pickedLatLng) ||
    (Boolean(city.trim()) && citySelected && !validateCity(city)) ||
    Boolean(address.trim());
  const blockingReason = !hasAnyLocationInput
    ? "Choose a location to continue."
    : cityErrorForState ||
        customNameErrorForState ||
        customCategoryTitleErrorForState ||
        dateErrorForState ||
        whatsappErrorForState ||
        (contactMethod === "NONE"
          ? "Please choose a contact method."
          : undefined)
      ? "Complete the required fields to continue."
      : null;
  const disablePrimaryAction = isSubmitting || Boolean(blockingReason);
  const generatedTitle = city.trim()
    ? `${categoryDisplay.label} in ${city.trim()}`
    : `${categoryDisplay.label} event`;
  const finalTitle = customName.trim() || generatedTitle;
  const resolvedSubmitMethod = submitMode === "edit" ? "PUT" : "POST";
  const resolvedSubmitUrl = submitUrl ?? "/api/events";
  const resolvedSubmitLabel =
    submitButtonLabel ?? (submitMode === "edit" ? "Save Changes" : "Save Event");
  const cityErrorId = "city-error";
  const customNameErrorId = "custom-name-error";
  const customCategoryTitleErrorId = "custom-category-title-error";
  const addressErrorId = "address-error";
  const dateErrorId = "date-error";
  const contactMethodErrorId = "contact-method-error";
  const whatsappInviteUrlErrorId = "whatsapp-invite-url-error";
  const locationErrorId = "location-error";
  const previewSection = (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-indigo-100 shadow">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Live Preview
        </p>
        <p className="mt-2 text-2xl font-bold text-gray-900">
          {categoryDisplay.emoji} {finalTitle}
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-700">
          <p className="flex items-start gap-2">
            <span aria-hidden="true">📍</span>
            <span>{city.trim() || "Choose a city, address, or map location"}</span>
          </p>
          <p className="flex items-start gap-2">
            <span aria-hidden="true">🕒</span>
            <span>
              {datePart
                ? timePart
                  ? new Date(`${datePart}T${timePart}`).toLocaleString()
                  : new Date(`${datePart}T00:00`).toLocaleDateString()
                : "Not set yet"}
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span aria-hidden="true">👥</span>
            <span>
              {autoApprove
                ? "Anyone can join"
                : "Request to join (organizer approval required)"}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );

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
    <form
      className={`space-y-6 ${submitMode === "create" ? "pb-28 md:pb-0" : ""}`}
      onSubmit={handleSubmit}
    >
      <p className="text-sm text-gray-600">
        <span aria-hidden="true" className="font-semibold text-red-600">
          *
        </span>{" "}
        Required fields
      </p>

      <div className="hidden md:block">{previewSection}</div>

      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">

        <div className="space-y-2">
          <p className="label-base mb-0">Quick categories</p>
          {hasPreferredQuickCategories ? (
            <p className="text-xs text-indigo-700">Based on your interests</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {featuredCategoryValues.map((value) => {
              const option = CATEGORY_OPTIONS.find((item) => item.value === value);
              if (!option) {
                return null;
              }
              const isActive = category === option.value;

              return (
                <Button
                  className={[
                    "min-h-[44px] max-w-full rounded-full border px-4 py-2 text-left text-sm leading-tight font-medium whitespace-normal break-words sm:whitespace-nowrap",
                    isActive
                      ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white"
                      : "border-gray-300 bg-gray-100 text-gray-700 hover:bg-indigo-100",
                  ].join(" ")}
                  key={option.value}
                  onClick={() => {
                    setCategory(option.value);
                    if (option.value !== "OTHER") {
                      setCustomCategoryTitle("");
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {option.emoji} {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            More categories
          </p>
          <label className="label-base" htmlFor="category">
            All categories
            {renderRequiredMark()}
          </label>
          <Select
            aria-required="true"
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
          </Select>
        </div>

        {category === "OTHER" ? (
          <div>
            <label className="label-base" htmlFor="customCategoryTitle">
              Other category title
              {renderRequiredMark()}
            </label>
            <Input
              aria-describedby={errors.customCategoryTitle ? customCategoryTitleErrorId : undefined}
              aria-invalid={errors.customCategoryTitle ? "true" : "false"}
              id="customCategoryTitle"
              maxLength={60}
              onChange={(e) => setCustomCategoryTitle(e.target.value)}
              placeholder="Enter category title"
              required
              type="text"
              value={customCategoryTitle}
            />
            {errors.customCategoryTitle ? (
              <p
                className="mt-1 text-sm text-red-600"
                id={customCategoryTitleErrorId}
                role="alert"
              >
                {errors.customCategoryTitle}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="label-base" htmlFor="customName">
            Custom name (optional)
          </label>
          <Input
            aria-describedby={errors.customName ? customNameErrorId : undefined}
            aria-invalid={errors.customName ? "true" : "false"}
            id="customName"
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Leave empty to generate a name automatically"
            type="text"
            value={customName}
          />
          {errors.customName ? (
            <p className="mt-1 text-sm text-red-600" id={customNameErrorId} role="alert">
              {errors.customName}
            </p>
          ) : null}
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-lg">Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-sm font-medium text-indigo-800">
            You can set the location in any of these ways:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-indigo-700">
            <li>Choose a city</li>
            <li>Enter an address or place</li>
            <li>Click directly on the map</li>
          </ul>
          <p className="mt-2 text-sm font-medium text-indigo-800">
            Add at least one location option{renderRequiredMark()}
          </p>
        </div>
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
          {errors.city ? (
            <p className="mt-1 text-sm text-red-600" id={cityErrorId} role="alert">
              {errors.city}
            </p>
          ) : null}
        </div>
        <div>
          <label className="label-base" htmlFor="address">
            Address / place (optional)
          </label>
          <Input
            aria-describedby={errors.address ? addressErrorId : undefined}
            aria-invalid={errors.address ? "true" : "false"}
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
            <Button
              disabled={isGeocoding}
              onClick={() => {
                void geocodeAddress();
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Find Address
            </Button>
            {isGeocoding ? <span className="text-sm text-gray-600">Finding...</span> : null}
          </div>
          {errors.address ? (
            <p className="mt-1 text-sm text-red-600" id={addressErrorId} role="alert">
              {errors.address}
            </p>
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
        </CardContent>
      </Card>
      {mapSlot}

      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-lg">Date & Time</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
        <p className="text-xs text-gray-600">Choose a date. Time is optional.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-base" htmlFor="date">
              Date
              {renderRequiredMark()}
            </label>
            <Input
              aria-describedby={errors.date ? dateErrorId : undefined}
              aria-invalid={errors.date ? "true" : "false"}
              id="date"
              onChange={(e) => setDatePart(e.target.value)}
              required
              type="date"
              value={datePart}
            />
          </div>
          <div>
            <label className="label-base" htmlFor="time">
              Time
            </label>
            <Select
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
            </Select>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Time can be selected only in 15-minute increments, or left empty.
        </p>
        {errors.date ? (
          <p className="text-sm text-red-600" id={dateErrorId} role="alert">
            {errors.date}
          </p>
        ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">

        <div>
          <label className="label-base" htmlFor="description">
            Description
          </label>
          <Textarea
            id="description"
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            value={description}
          />
        </div>

        <div>
          <label className="label-base" htmlFor="contactMethod">
            Contact method
            {renderRequiredMark()}
          </label>
          <Select
            aria-describedby={errors.contactMethod ? contactMethodErrorId : undefined}
            aria-invalid={errors.contactMethod ? "true" : "false"}
            aria-required="true"
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
          </Select>
          {errors.contactMethod ? (
            <p className="mt-1 text-sm text-red-600" id={contactMethodErrorId} role="alert">
              {errors.contactMethod}
            </p>
          ) : null}
        </div>

        {contactMethod === "WHATSAPP_GROUP" ? (
          <div>
            <label className="label-base" htmlFor="whatsappInviteUrl">
              WhatsApp group invite link
              {renderRequiredMark()}
            </label>
            <Input
              aria-describedby={
                errors.whatsappInviteUrl ? whatsappInviteUrlErrorId : undefined
              }
              aria-invalid={errors.whatsappInviteUrl ? "true" : "false"}
              id="whatsappInviteUrl"
              onChange={(e) => setWhatsappInviteUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              required
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
          <Select
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
          </Select>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Join policy
          </p>
          <label className="label-base" htmlFor="joinPolicy">
            Who can join
          </label>
          <Select
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
          </Select>
          <div className="mt-2">
            <Badge variant={autoApprove ? "success" : "secondary"}>
              {autoApprove ? "Anyone can join" : "Approval required"}
            </Badge>
          </div>
        </div>

        {errors.whatsappInviteUrl ? (
          <p className="text-sm text-red-600" id={whatsappInviteUrlErrorId} role="alert">
            {errors.whatsappInviteUrl}
          </p>
        ) : null}
      </CardContent>
      </Card>

      <div className="md:hidden">{previewSection}</div>

      {errors.location ? (
        <p className="text-sm text-red-600" id={locationErrorId} role="alert">
          {errors.location}
        </p>
      ) : null}

      {submitMode === "create" ? (
        <div className="sticky bottom-0 z-20 rounded-t-xl border-t border-gray-200 bg-white/95 px-2 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-2">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => {
                if (onCancel) {
                  onCancel();
                  return;
                }

                if (typeof window !== "undefined") {
                  window.history.back();
                }
              }}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px] w-full py-3 text-base font-semibold sm:flex-1"
              disabled={disablePrimaryAction}
              type="submit"
            >
              {isSubmitting ? "Saving..." : resolvedSubmitLabel}
            </Button>
          </div>
          {blockingReason ? (
            <p className="mt-2 text-xs text-gray-600">{blockingReason}</p>
          ) : null}
        </div>
      ) : (
        <Button
          className="w-full py-3 text-lg font-semibold"
          disabled={disablePrimaryAction}
          type="submit"
        >
          {isSubmitting ? "Saving..." : resolvedSubmitLabel}
        </Button>
      )}
      {submitError ? (
        <p className="text-sm text-red-600" role="alert">
          {submitError}
        </p>
      ) : null}
    </form>
  );
}
