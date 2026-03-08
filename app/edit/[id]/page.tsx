"use client";

import dynamic from "next/dynamic";
import { signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CreateEventForm from "@/src/components/CreateEventForm";
import {
  type ContactMethod,
  type ContactVisibility,
} from "@/src/lib/contactMethods";
import { isValidCategory, type EventCategory } from "@/src/lib/eventCategories";
import { useSessionClient } from "@/src/lib/sessionClient";
import type { Event } from "@/src/types/event";

type LatLng = { lat: number; lng: number };
type LocationStatus = "idle" | "loading" | "success" | "error";

const LocationPickerMap = dynamic(
  () => import("@/src/components/LocationPickerMap"),
  { ssr: false },
);

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status, isAuthenticated, userId } = useSessionClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickedLatLng, setPickedLatLng] = useState<LatLng | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [mapFocusLatLng, setMapFocusLatLng] = useState<LatLng | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<{
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
  } | null>(null);

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
    if (!params.id) {
      return;
    }

    let isMounted = true;

    const loadEvent = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/events/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load event.");
        }

        const found = (await response.json()) as Event;
        if (!isMounted) {
          return;
        }

        setEvent(found);
        setInitialValues({
          category: isValidCategory(found.category) ? found.category : "COFFEE",
          customName: found.title,
          customCategoryTitle: found.customCategoryTitle,
          city: found.city,
          address: found.address,
          description: found.description,
          contactMethod: found.contactMethod,
          contactVisibility: found.contactVisibility,
          whatsappInviteUrl: found.whatsappInviteUrl,
          autoApprove: found.autoApprove,
          dateISO: found.dateISO,
        });

        if (Number.isFinite(found.lat) && Number.isFinite(found.lng)) {
          const coords = { lat: found.lat, lng: found.lng };
          setPickedLatLng(coords);
          setMapFocusLatLng(coords);
        }
      } catch {
        if (isMounted) {
          setError("Failed to load event.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadEvent();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  const notAllowed = useMemo(() => {
    if (!event || !userId) {
      return false;
    }
    return event.userId !== userId;
  }, [event, userId]);

  if (status === "loading") {
    return (
      <main className="app-shell">
        <p className="body-muted">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell page-stack">
        <h1 className="page-title">Edit Event</h1>
        <p className="body-muted">Please sign in to edit events.</p>
        <button
          className="btn-primary"
          onClick={() => signIn("google", { callbackUrl: `/edit/${params.id}` })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app-shell">
        <p className="body-muted">Loading event...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <p className="body-muted text-red-600">{error}</p>
      </main>
    );
  }

  if (notAllowed) {
    return (
      <main className="app-shell page-stack">
        <h1 className="page-title">Edit Event</h1>
        <p className="mt-3 text-red-600">Not allowed.</p>
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
      <h1 className="page-title">Edit Event</h1>

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <CreateEventForm
            initialValues={initialValues}
            onCityChange={setCityQuery}
            onPickedLatLngChange={setPickedLatLng}
            onSubmitSuccess={() => router.push("/my-events")}
            pickedLatLng={pickedLatLng}
            submitButtonLabel="Save Changes"
            submitMode="edit"
            submitUrl={`/api/events/${params.id}`}
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
