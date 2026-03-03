"use client";

import { useMemo, useState } from "react";
import { loadEvents, saveEvents } from "@/src/lib/eventsStorage";
import type { Event } from "@/src/types/event";

type LatLng = { lat: number; lng: number };

type FormErrors = {
  title?: string;
  address?: string;
  date?: string;
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

export default function CreateEventForm({
  pickedLatLng,
  onPickedLatLngChange,
  onSubmitSuccess,
}: CreateEventFormProps) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);

  const locationLabel = useMemo(() => {
    if (!pickedLatLng) {
      return "No location selected";
    }
    return `${pickedLatLng.lat.toFixed(5)}, ${pickedLatLng.lng.toFixed(5)}`;
  }, [pickedLatLng]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {
      title: validateTitle(title),
      address: validateAddress(address),
      date: validateDateISO(dateLocal),
      location: validateLocation(pickedLatLng),
    };

    const hasError = Boolean(
      nextErrors.title ||
        nextErrors.address ||
        nextErrors.date ||
        nextErrors.location,
    );
    if (hasError) {
      setErrors(nextErrors);
      return;
    }

    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString();

    const dateISO = dateLocal ? new Date(dateLocal).toISOString() : undefined;

    const newEvent: Event = {
      id,
      title: title.trim(),
      address: address.trim() || undefined,
      description: description.trim() || undefined,
      dateISO,
      lat: pickedLatLng!.lat,
      lng: pickedLatLng!.lng,
      createdAtISO: new Date().toISOString(),
    };

    const existing = loadEvents();
    saveEvents([...existing, newEvent]);

    setErrors({});
    onSubmitSuccess();
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
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(trimmed)}`,
        {
          method: "GET",
        },
      );

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

      <div>
        <p className="text-sm text-gray-600">Selected location: {locationLabel}</p>
        {errors.location ? (
          <p className="mt-1 text-sm text-red-600">{errors.location}</p>
        ) : null}
      </div>

      <button
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Save Event
      </button>
    </form>
  );
}
