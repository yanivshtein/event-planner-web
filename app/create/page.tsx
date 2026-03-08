"use client";

import dynamic from "next/dynamic";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CreateEventForm from "@/src/components/CreateEventForm";
import {
  type ContactMethod,
  type ContactVisibility,
} from "@/src/lib/contactMethods";
import { isValidCategory, type EventCategory } from "@/src/lib/eventCategories";
import type { Event } from "@/src/types/event";

type LatLng = { lat: number; lng: number };
type LocationStatus = "idle" | "loading" | "success" | "error";

const LocationPickerMap = dynamic(
  () => import("@/src/components/LocationPickerMap"),
  {
    ssr: false,
  },
);

export default function CreatePage() {
  const router = useRouter();
  const { status } = useSession();
  const [pickedLatLng, setPickedLatLng] = useState<LatLng | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [mapFocusLatLng, setMapFocusLatLng] = useState<LatLng | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<{
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
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncDuplicateId = () => {
      const nextDuplicateId = new URLSearchParams(window.location.search).get(
        "duplicate",
      );
      setDuplicateId(nextDuplicateId);
    };

    syncDuplicateId();
    window.addEventListener("popstate", syncDuplicateId);
    return () => {
      window.removeEventListener("popstate", syncDuplicateId);
    };
  }, []);

  useEffect(() => {
    const query = cityQuery.trim();
    if (!query) {
      setMapFocusLatLng(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { lat?: number; lng?: number };
        if (
          cancelled ||
          typeof data.lat !== "number" ||
          typeof data.lng !== "number" ||
          !Number.isFinite(data.lat) ||
          !Number.isFinite(data.lng)
        ) {
          return;
        }

        setMapFocusLatLng({ lat: data.lat, lng: data.lng });
      } catch {
        // Ignore map recenter failures.
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cityQuery]);

  useEffect(() => {
    if (!duplicateId) {
      setDuplicateInitialValues(null);
      setDuplicateError(null);
      return;
    }

    let cancelled = false;
    setDuplicateLoading(true);
    setDuplicateError(null);

    const loadDuplicate = async () => {
      try {
        const response = await fetch(`/api/events/${duplicateId}`, {
          method: "GET",
          cache: "no-store",
        });
        if (response.status === 404) {
          if (!cancelled) {
            setDuplicateError("Could not find the event to duplicate.");
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to load event for duplication.");
        }

        const event = (await response.json()) as Event;
        if (cancelled) {
          return;
        }

        setDuplicateInitialValues({
          category: isValidCategory(event.category) ? event.category : "COFFEE",
          customName: event.title,
          customCategoryTitle: event.customCategoryTitle,
          city: event.city,
          address: event.address,
          description: event.description,
          contactMethod: event.contactMethod,
          contactVisibility: event.contactVisibility,
          whatsappInviteUrl: event.whatsappInviteUrl,
          autoApprove: event.autoApprove,
        });

        if (Number.isFinite(event.lat) && Number.isFinite(event.lng)) {
          const coords = { lat: event.lat, lng: event.lng };
          setPickedLatLng(coords);
          setMapFocusLatLng(coords);
        }
      } catch {
        if (!cancelled) {
          setDuplicateError("Failed to load event to duplicate.");
        }
      } finally {
        if (!cancelled) {
          setDuplicateLoading(false);
        }
      }
    };

    void loadDuplicate();
    return () => {
      cancelled = true;
    };
  }, [duplicateId]);

  if (status === "loading") {
    return (
      <main className="app-shell">
        <p className="body-muted">Checking authentication...</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="app-shell page-stack">
        <h1 className="page-title">Create Event</h1>
        <p className="body-muted">Please sign in to create an event.</p>
        <button
          className="btn-primary"
          onClick={() => signIn("google", { callbackUrl: "/create" })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  const locationStatusText =
    locationStatus === "loading"
      ? "Getting your location..."
      : locationStatus === "success"
        ? "Centered on your location."
        : locationStatus === "error"
          ? `${locationError ?? "Could not get your location."} You can still choose a location by clicking the map.`
          : "Click the map to choose event location.";

  return (
    <main className="app-shell page-stack">
      <h1 className="page-title">Create Event</h1>
      {duplicateId ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Creating a new event based on a previous one
        </div>
      ) : null}
      {duplicateLoading ? (
        <p className="body-muted">Loading event to duplicate...</p>
      ) : null}
      {duplicateError ? (
        <p className="body-muted text-red-600">{duplicateError}</p>
      ) : null}

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <CreateEventForm
            onCityChange={setCityQuery}
            initialValues={duplicateInitialValues}
            onPickedLatLngChange={setPickedLatLng}
            onSubmitSuccess={() => router.push("/")}
            pickedLatLng={pickedLatLng}
          />
        </div>

        <div className="ui-card space-y-3">
          <h2 className="section-title text-lg">Choose the location on the map</h2>
          <p className="body-muted mt-1">
            Choose a city, enter an address, or click directly on the map.
          </p>
          <p className="body-muted">{locationStatusText}</p>
          <div className="h-[420px] overflow-hidden rounded-xl border border-gray-200 shadow-md">
            <LocationPickerMap
              center={[32.0853, 34.7818]}
              focusLatLng={mapFocusLatLng}
              onLocationStatusChange={({ status, errorMessage }) => {
                setLocationStatus(status);
                setLocationError(errorMessage);
              }}
              onChange={setPickedLatLng}
              value={pickedLatLng}
              zoom={13}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
