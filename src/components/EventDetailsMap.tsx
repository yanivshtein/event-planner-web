"use client";

import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryDisplay, isValidCategory } from "@/src/lib/eventCategories";

type EventDetailsMapProps = {
  lat: number;
  lng: number;
  title: string;
  category: string;
  customCategoryTitle?: string;
};

function makeEmojiIcon(emoji: string) {
  return L.divIcon({
    className: "emoji-marker",
    html: `<div class=\"emoji-pin\">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export default function EventDetailsMap({
  lat,
  lng,
  title,
  category,
  customCategoryTitle,
}: EventDetailsMapProps) {
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);
  const mapStyle = useMemo(() => ({ height: "280px", width: "100%" }), []);
  const meta = isValidCategory(category)
    ? getCategoryDisplay(category, customCategoryTitle)
    : { emoji: "📍", label: "Unknown" };
  const icon = useMemo(() => makeEmojiIcon(meta.emoji), [meta.emoji]);

  return (
    <MapContainer
      center={center}
      dragging={false}
      scrollWheelZoom={false}
      style={mapStyle}
      zoom={15}
      zoomControl={false}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker icon={icon} position={center} title={title} />
    </MapContainer>
  );
}
