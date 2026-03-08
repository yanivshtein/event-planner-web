"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import type { MapBounds } from "@/src/components/MapEvents";
import type { Event } from "@/src/types/event";

type MapEventsClientProps = {
  initialCenter: [number, number];
  initialZoom: number;
  events: Event[];
  pendingFocusEventId: string | null;
  onSelect: (id: string, shouldFocus?: boolean) => void;
  onFocusHandled: () => void;
  onBoundsChange?: (bounds: MapBounds) => void;
};

const MapEvents = dynamic(() => import("@/src/components/MapEvents"), {
  ssr: false,
});

function MapEventsClient({
  initialCenter,
  initialZoom,
  events,
  pendingFocusEventId,
  onSelect,
  onFocusHandled,
  onBoundsChange,
}: MapEventsClientProps) {
  return (
    <MapEvents
      events={events}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      onBoundsChange={onBoundsChange}
      onFocusHandled={onFocusHandled}
      onSelect={onSelect}
      pendingFocusEventId={pendingFocusEventId}
    />
  );
}

export default memo(MapEventsClient);
