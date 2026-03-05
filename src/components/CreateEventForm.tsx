"use client";

import { useState } from "react";
import {
  CONTACT_METHOD_OPTIONS,
  CONTACT_VISIBILITY_OPTIONS,
  type ContactMethod,
  type ContactVisibility,
} from "@/src/lib/contactMethods";
import {
  CATEGORY_GROUPS,
  type EventCategory,
} from "@/src/lib/eventCategories";

type LatLng = { lat: number; lng: number };

type FormErrors = {
  title?: string;
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
  onSubmitSuccess: () => void;
};

function validateTitle(title: string): string | undefined {
  if (title.trim().length < 2) {
    return "Title must be at least 2 characters.";
  }
  return undefined;
}

function validateDateISO(dateLocal: string): string | undefined {
  if (!dateLocal) {
    return undefined;
  }

  const parsed = new Date(dateLocal);
  if (Number.isNaN(parsed.getTime())) {
    return "Date must be valid.";
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
    return "Please select a location on the map.";
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
  onSubmitSuccess,
}: CreateEventFormProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>("COFFEE");
  const [customCategoryTitle, setCustomCategoryTitle] = useState("");
  const [address, setAddress] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [description, setDescription] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("NONE");
  const [contactVisibility, setContactVisibility] =
    useState<ContactVisibility>("SIGNED_IN_ONLY");
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      return "You need to sign in before creating an event.";
    }

    if (response.status === 403) {
      return "You are not allowed to create this event.";
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
      title: validateTitle(title),
      customCategoryTitle:
        category === "OTHER" && customCategoryTitle.trim().length < 2
          ? "Please enter a title for the Other category."
          : undefined,
      address: validateAddress(address),
      date: validateDateISO(dateLocal),
      contactMethod: undefined,
      whatsappInviteUrl: validateWhatsappInviteUrl(
        contactMethod,
        whatsappInviteUrl,
      ),
      location: validateLocation(pickedLatLng),
    };

    const hasError = Boolean(
      nextErrors.title ||
        nextErrors.customCategoryTitle ||
        nextErrors.address ||
        nextErrors.date ||
        nextErrors.location,
    );
    if (hasError) {
      setErrors(nextErrors);
      return;
    }

    const dateISO = dateLocal ? new Date(dateLocal).toISOString() : undefined;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          category,
          customCategoryTitle:
            category === "OTHER" ? customCategoryTitle.trim() : undefined,
          address: address.trim() || undefined,
          description: description.trim() || undefined,
          dateISO,
          contactMethod,
          contactVisibility,
          whatsappInviteUrl:
            contactMethod === "WHATSAPP_GROUP"
              ? whatsappInviteUrl.trim()
              : undefined,
          lat: pickedLatLng!.lat,
          lng: pickedLatLng!.lng,
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
        setAddress(data.displayName.trim().slice(0, 120));
      }
      setGeocodeMessage("Location found on map");
    } catch {
      setGeocodeMessage("Address not found. Try a more specific address.");
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="title">
          Title
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          id="title"
          onChange={(e) => setTitle(e.target.value)}
          required
          type="text"
          value={title}
        />
        {errors.title ? <p className="mt-1 text-sm text-red-600">{errors.title}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="category">
          Category
        </label>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
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
        {category === "OTHER" ? (
          <div className="mt-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="address">
          Address (optional)
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          id="address"
          maxLength={120}
          placeholder="Leave empty if you don't want to set an address"
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
            className="rounded-md border px-3 py-1 text-sm"
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

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="contactMethod">
          Contact method
        </label>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
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
          {CONTACT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {contactMethod === "WHATSAPP_GROUP" ? (
          <div className="mt-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="whatsappInviteUrl">
              WhatsApp group invite link
            </label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              id="whatsappInviteUrl"
              onChange={(e) => setWhatsappInviteUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              type="url"
              value={whatsappInviteUrl}
            />
          </div>
        ) : null}

        {contactMethod === "ORGANIZER_PHONE" ? (
          <p className="mt-2 text-xs text-gray-600">
            Make sure you added your phone in Settings.
          </p>
        ) : null}

        {errors.whatsappInviteUrl ? (
          <p className="mt-1 text-sm text-red-600">{errors.whatsappInviteUrl}</p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="contactVisibility">
          Contact visibility
        </label>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
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

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="date">
          Date & Time
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          id="date"
          onChange={(e) => setDateLocal(e.target.value)}
          type="datetime-local"
          value={dateLocal}
        />
        {errors.date ? <p className="mt-1 text-sm text-red-600">{errors.date}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="description">
          Description
        </label>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
          id="description"
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          value={description}
        />
      </div>

      {errors.location ? (
        <p className="text-sm text-red-600">{errors.location}</p>
      ) : null}

      <button
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving..." : "Save Event"}
      </button>
      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
    </form>
  );
}
