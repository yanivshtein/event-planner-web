"use client";

import { useCallback, useEffect, useState } from "react";

type LatLng = { lat: number; lng: number };
type LocationStatus = "idle" | "loading" | "success" | "error";

type UseCurrentLocationResult = {
  status: LocationStatus;
  coords: LatLng | null;
  errorMessage: string | null;
  requestLocation: () => void;
};

function getFriendlyErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied.";
  }

  if (error.code === error.TIMEOUT) {
    return "Timed out while trying to get your location.";
  }

  return "Unable to get your location right now.";
}

export default function useCurrentLocation(): UseCurrentLocationResult {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("error");
      setErrorMessage("Geolocation is not available in this browser.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setStatus("success");
      },
      (error) => {
        setStatus("error");
        setErrorMessage(getFriendlyErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      requestLocation();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [requestLocation]);

  return {
    status,
    coords,
    errorMessage,
    requestLocation,
  };
}
