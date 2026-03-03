"use client";

import dynamic from "next/dynamic";

type MapEventsClientProps = {
  initialCenter: [number, number];
  initialZoom: number;
};

const MapEvents = dynamic(() => import("@/src/components/MapEvents"), {
  ssr: false,
});

export default function MapEventsClient({
  initialCenter,
  initialZoom,
}: MapEventsClientProps) {
  return <MapEvents initialCenter={initialCenter} initialZoom={initialZoom} />;
}
