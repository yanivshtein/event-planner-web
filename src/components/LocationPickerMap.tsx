"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Icon } from "leaflet";
import useCurrentLocation from "@/src/hooks/useCurrentLocation";

type LatLng = { lat: number; lng: number };
type LocationStatus = "idle" | "loading" | "success" | "error";

type LocationPickerMapProps = {
  center: [number, number];
  zoom: number;
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  onLocationStatusChange?: (value: {
    status: LocationStatus;
    errorMessage: string | null;
  }) => void;
};

const markerIconUrl = typeof markerIcon === "string" ? markerIcon : markerIcon.src;
const markerIcon2xUrl =
  typeof markerIcon2x === "string" ? markerIcon2x : markerIcon2x.src;
const markerShadowUrl =
  typeof markerShadow === "string" ? markerShadow : markerShadow.src;

type ClickHandlerProps = {
  onChange: (value: LatLng) => void;
};

type MapViewControllerProps = {
  target: LatLng | null;
};

function ClickHandler({ onChange }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}

function MapViewController({ target }: MapViewControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    map.setView([target.lat, target.lng], map.getZoom());
  }, [map, target]);

  return null;
}

export default function LocationPickerMap({
  center,
  zoom,
  value,
  onChange,
  onLocationStatusChange,
}: LocationPickerMapProps) {
  const [defaultIcon, setDefaultIcon] = useState<Icon | undefined>(undefined);
  const [recenterTarget, setRecenterTarget] = useState<LatLng | null>(null);
  const { status, coords, errorMessage, requestLocation } = useCurrentLocation();

  useEffect(() => {
    let isMounted = true;

    const setupDefaultIcon = async () => {
      const leaflet = await import("leaflet");
      const icon = leaflet.icon({
        iconRetinaUrl: markerIcon2xUrl,
        iconUrl: markerIconUrl,
        shadowUrl: markerShadowUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      if (isMounted) {
        setDefaultIcon(icon);
      }
    };

    void setupDefaultIcon();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    onLocationStatusChange?.({ status, errorMessage });
  }, [errorMessage, onLocationStatusChange, status]);

  useEffect(() => {
    if (status !== "success" || !coords) {
      return;
    }

    setRecenterTarget(coords);
    if (!value) {
      onChange(coords);
    }
  }, [coords, onChange, status, value]);

  useEffect(() => {
    if (!value) {
      return;
    }

    setRecenterTarget(value);
  }, [value]);

  const initialCenter = useMemo<[number, number]>(() => {
    if (coords) {
      return [coords.lat, coords.lng];
    }

    return center;
  }, [center, coords]);

  const mapStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  return (
    <div className="relative h-full w-full">
      <button
        className="absolute right-3 top-3 z-[1000] rounded-md bg-white px-3 py-1 text-xs font-medium shadow"
        onClick={requestLocation}
        type="button"
      >
        Use my location
      </button>

      <MapContainer center={initialCenter} style={mapStyle} zoom={zoom}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewController target={recenterTarget} />
        <ClickHandler onChange={onChange} />
        {value ? (
          <Marker
            {...(defaultIcon ? { icon: defaultIcon } : {})}
            position={[value.lat, value.lng]}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
