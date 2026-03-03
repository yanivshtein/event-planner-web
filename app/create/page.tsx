"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import CreateEventForm from "@/src/components/CreateEventForm";

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
  const [pickedLatLng, setPickedLatLng] = useState<LatLng | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);

  const locationStatusText =
    locationStatus === "loading"
      ? "Getting your location..."
      : locationStatus === "success"
        ? "Centered on your location."
        : locationStatus === "error"
          ? `${locationError ?? "Could not get your location."} You can still choose a location by clicking the map.`
          : "Click the map to choose event location.";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Create Event</h1>
      <p className="mt-2 text-sm text-gray-600">
        Click the map to choose event location.
      </p>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <CreateEventForm
            onPickedLatLngChange={setPickedLatLng}
            onSubmitSuccess={() => router.push("/")}
            pickedLatLng={pickedLatLng}
          />
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-sm text-gray-600">{locationStatusText}</p>
          <div className="mt-3 h-[360px] overflow-hidden rounded-lg">
            <LocationPickerMap
              center={[32.0853, 34.7818]}
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
