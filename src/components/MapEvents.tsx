"use client";

import L, { type DivIcon, type Marker as LeafletMarker } from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MarkerClusterGroup from "react-leaflet-cluster";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  CATEGORY_OPTIONS,
  getCategoryDisplay,
  isValidCategory,
  type EventCategory,
} from "@/src/lib/eventCategories";
import { useSessionClient } from "@/src/lib/sessionClient";
import type { Event } from "@/src/types/event";
import useCurrentLocation from "@/src/hooks/useCurrentLocation";

type MapEventsProps = {
  initialCenter: [number, number];
  initialZoom: number;
  events: Event[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
  onDeleted?: (id: string) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
};

type LatLng = { lat: number; lng: number };
export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type FocusControllerProps = {
  selectedEventId: string | null;
  events: Event[];
  markerRefs: React.MutableRefObject<Record<string, LeafletMarker | null>>;
};

type RecenterControllerProps = {
  target: LatLng | null;
};

type BoundsControllerProps = {
  onBoundsChange?: (bounds: MapBounds) => void;
};

type MapReadyGateProps = {
  children: ReactNode;
};

function makeEmojiIcon(emoji: string): DivIcon {
  return L.divIcon({
    className: "emoji-marker",
    html: `<div class=\"emoji-pin\">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function makeClusterIcon(clusterSize: number): DivIcon {
  return L.divIcon({
    className: "event-cluster-icon",
    html: `<div class="event-cluster-badge">${clusterSize}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function FocusController({
  selectedEventId,
  events,
  markerRefs,
}: FocusControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    const target = events.find((event) => event.id === selectedEventId);
    if (!target) {
      return;
    }

    map.flyTo([target.lat, target.lng], map.getZoom(), {
      animate: true,
      duration: 0.5,
    });

    const marker = markerRefs.current[selectedEventId];
    marker?.openPopup();
  }, [events, map, markerRefs, selectedEventId]);

  return null;
}

function RecenterController({ target }: RecenterControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    map.flyTo([target.lat, target.lng], map.getZoom(), {
      animate: true,
      duration: 0.5,
    });
  }, [map, target]);

  return null;
}

function BoundsController({ onBoundsChange }: BoundsControllerProps) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
  });

  useEffect(() => {
    const bounds = map.getBounds();
    onBoundsChange?.({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  }, [map, onBoundsChange]);

  return null;
}

function MapReadyGate({ children }: MapReadyGateProps) {
  const map = useMap();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    map.whenReady(() => {
      if (!cancelled) {
        setIsReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [map]);

  if (!isReady) {
    return null;
  }

  return <>{children}</>;
}

export default function MapEvents({
  initialCenter,
  initialZoom,
  events,
  selectedEventId,
  onSelect,
  onDeleted,
  onBoundsChange,
}: MapEventsProps) {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
  const { status, coords, requestLocation } = useCurrentLocation();
  const { userId } = useSessionClient();

  const mapCenter = useMemo<[number, number]>(() => {
    if (coords) {
      return [coords.lat, coords.lng];
    }

    return initialCenter;
  }, [coords, initialCenter]);

  const mapStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  const iconMap = useMemo(() => {
    const map = {} as Record<EventCategory, DivIcon>;
    CATEGORY_OPTIONS.forEach((option) => {
      map[option.value] = makeEmojiIcon(option.emoji);
    });
    return map;
  }, []);
  const fallbackIcon = useMemo(() => makeEmojiIcon("📍"), []);

  const getMarkerIcon = (category: string) => {
    if (isValidCategory(category)) {
      return iconMap[category];
    }

    return fallbackIcon;
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/events/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        return;
      }

      onDeleted?.(id);
    } catch {
      // Keep UI stable if API delete fails.
    }
  };

  return (
    <div className="relative h-full w-full">
      <button
        className="absolute right-3 top-3 z-[1000] rounded-md bg-white px-3 py-1 text-xs font-medium shadow"
        onClick={requestLocation}
        type="button"
      >
        Use my location
      </button>

      <MapContainer center={mapCenter} style={mapStyle} zoom={initialZoom}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FocusController
          events={events}
          markerRefs={markerRefs}
          selectedEventId={selectedEventId}
        />
        <BoundsController onBoundsChange={onBoundsChange} />
        <RecenterController target={status === "success" ? coords : null} />

        <MapReadyGate>
          <MarkerClusterGroup
            disableClusteringAtZoom={16}
            iconCreateFunction={(cluster: L.MarkerCluster) =>
              makeClusterIcon(cluster.getChildCount())
            }
            maxClusterRadius={60}
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
          >
            {events.map((event) => {
              const categoryMeta = getCategoryDisplay(
                event.category,
                event.customCategoryTitle,
              );

              return (
                <Marker
                  eventHandlers={{
                    click: () => onSelect(event.id),
                  }}
                  icon={getMarkerIcon(event.category)}
                  key={event.id}
                  position={[event.lat, event.lng]}
                  ref={(marker) => {
                    markerRefs.current[event.id] = marker;
                  }}
                >
                  <Popup>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        {categoryMeta.emoji} {categoryMeta.label}
                      </p>
                      <p
                        className={
                          selectedEventId === event.id
                            ? "font-semibold text-blue-700"
                            : "font-semibold"
                        }
                      >
                        {event.title}
                      </p>
                      {event.address ? <p>{event.address}</p> : null}
                      {event.dateISO ? (
                        <p className="text-sm text-gray-700">
                          {new Date(event.dateISO).toLocaleString()}
                        </p>
                      ) : null}
                      {event.description ? <p>{event.description}</p> : null}
                      <Link
                        className="inline-block text-sm text-blue-700 underline"
                        href={`/events/${event.id}`}
                      >
                        View details
                      </Link>
                      {userId && event.userId === userId ? (
                        <div className="flex items-center gap-2">
                          <Link
                            className="rounded bg-gray-800 px-2 py-1 text-sm text-white"
                            href={`/edit/${event.id}`}
                          >
                            Edit
                          </Link>
                          <button
                            className="rounded bg-red-600 px-2 py-1 text-sm text-white"
                            onClick={() => handleDeleteEvent(event.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapReadyGate>
      </MapContainer>
    </div>
  );
}
