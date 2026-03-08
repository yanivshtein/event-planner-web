"use client";

import L, { type DivIcon, type Marker as LeafletMarker } from "leaflet";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MarkerClusterGroup from "react-leaflet-cluster";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import {
  CATEGORY_OPTIONS,
  isValidCategory,
  type EventCategory,
} from "@/src/lib/eventCategories";
import type { Event } from "@/src/types/event";
import useCurrentLocation from "@/src/hooks/useCurrentLocation";

type MapEventsProps = {
  initialCenter: [number, number];
  initialZoom: number;
  events: Event[];
  pendingFocusEventId: string | null;
  onSelect: (id: string, shouldFocus?: boolean) => void;
  onFocusHandled: () => void;
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
  pendingFocusEventId: string | null;
  eventsById: ReadonlyMap<string, Event>;
  markerRefs: React.MutableRefObject<Record<string, LeafletMarker | null>>;
  userMovedMapRef: React.MutableRefObject<boolean>;
  boundsSuppressionRef: React.MutableRefObject<{
    remaining: number;
    emitAfter: boolean;
  }>;
  onFocusHandled: () => void;
};

type RecenterControllerProps = {
  target: LatLng | null;
};

type InitialCenterControllerProps = {
  events: Event[];
  mapInitialized: boolean;
  userHasMovedMap: boolean;
  onMapInitialized: () => void;
  boundsSuppressionRef: React.MutableRefObject<{
    remaining: number;
    emitAfter: boolean;
  }>;
};

type BoundsControllerProps = {
  onBoundsChange?: (bounds: MapBounds) => void;
  boundsSuppressionRef: React.MutableRefObject<{
    remaining: number;
    emitAfter: boolean;
  }>;
};

type InteractionControllerProps = {
  onUserMoveMap: () => void;
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
  pendingFocusEventId,
  eventsById,
  markerRefs,
  userMovedMapRef,
  boundsSuppressionRef,
  onFocusHandled,
}: FocusControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!pendingFocusEventId) {
      return;
    }

    if (userMovedMapRef.current) {
      onFocusHandled();
      return;
    }

    const selectedEvent = eventsById.get(pendingFocusEventId);
    if (!selectedEvent) {
      onFocusHandled();
      return;
    }

    boundsSuppressionRef.current = {
      remaining: 2,
      emitAfter: false,
    };
    map.flyTo([selectedEvent.lat, selectedEvent.lng], map.getZoom(), {
      animate: true,
      duration: 0.5,
    });

    const marker = markerRefs.current[selectedEvent.id];
    marker?.openPopup();
    onFocusHandled();
  }, [
    boundsSuppressionRef,
    eventsById,
    map,
    markerRefs,
    onFocusHandled,
    pendingFocusEventId,
    userMovedMapRef,
  ]);

  return null;
}

function InitialCenterController({
  events,
  mapInitialized,
  userHasMovedMap,
  onMapInitialized,
  boundsSuppressionRef,
}: InitialCenterControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (mapInitialized || userHasMovedMap || events.length === 0) {
      return;
    }

    const firstEvent = events[0];
    boundsSuppressionRef.current = {
      remaining: 1,
      emitAfter: false,
    };
    map.setView([firstEvent.lat, firstEvent.lng], map.getZoom(), {
      animate: false,
    });
    onMapInitialized();
  }, [
    boundsSuppressionRef,
    events,
    map,
    mapInitialized,
    onMapInitialized,
    userHasMovedMap,
  ]);

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

function InteractionController({ onUserMoveMap }: InteractionControllerProps) {
  useMapEvents({
    dragstart: (event) => {
      if ("originalEvent" in event && event.originalEvent) {
        onUserMoveMap();
      }
    },
    movestart: (event) => {
      if ("originalEvent" in event && event.originalEvent) {
        onUserMoveMap();
      }
    },
    zoomstart: (event) => {
      if ("originalEvent" in event && event.originalEvent) {
        onUserMoveMap();
      }
    },
  });

  return null;
}

function BoundsController({
  onBoundsChange,
  boundsSuppressionRef,
}: BoundsControllerProps) {
  const emitBounds = () => {
    const bounds = map.getBounds();
    onBoundsChange?.({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  };

  const map = useMapEvents({
    moveend: () => {
      if (boundsSuppressionRef.current.remaining > 0) {
        boundsSuppressionRef.current.remaining -= 1;
        if (
          boundsSuppressionRef.current.remaining === 0 &&
          boundsSuppressionRef.current.emitAfter
        ) {
          boundsSuppressionRef.current.emitAfter = false;
          emitBounds();
        }
        return;
      }

      emitBounds();
    },
    zoomend: () => {
      if (boundsSuppressionRef.current.remaining > 0) {
        boundsSuppressionRef.current.remaining -= 1;
        if (
          boundsSuppressionRef.current.remaining === 0 &&
          boundsSuppressionRef.current.emitAfter
        ) {
          boundsSuppressionRef.current.emitAfter = false;
          emitBounds();
        }
        return;
      }

      emitBounds();
    },
  });

  useEffect(() => {
    emitBounds();
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
  pendingFocusEventId,
  onSelect,
  onFocusHandled,
  onBoundsChange,
}: MapEventsProps) {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
  const { status, coords, requestLocation } = useCurrentLocation();
  const [mapInitialized, setMapInitialized] = useState(false);
  const [userHasMovedMap, setUserHasMovedMap] = useState(false);
  const [recenterTarget, setRecenterTarget] = useState<LatLng | null>(null);
  const userMovedMapRef = useRef(false);
  const boundsSuppressionRef = useRef({
    remaining: 0,
    emitAfter: false,
  });
  const shouldRecenterToCurrentLocationRef = useRef(false);
  const hasAutoCenteredToCurrentLocationRef = useRef(false);

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
  const eventsById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );

  const handleUseMyLocation = () => {
    shouldRecenterToCurrentLocationRef.current = true;
    requestLocation();

    if (coords) {
      boundsSuppressionRef.current = {
        remaining: 1,
        emitAfter: true,
      };
      setRecenterTarget(coords);
      shouldRecenterToCurrentLocationRef.current = false;
    }
  };

  useEffect(() => {
    if (
      status === "success" &&
      coords &&
      shouldRecenterToCurrentLocationRef.current
    ) {
      boundsSuppressionRef.current = {
        remaining: 1,
        emitAfter: true,
      };
      setRecenterTarget(coords);
      shouldRecenterToCurrentLocationRef.current = false;
    }
  }, [coords, status]);

  useEffect(() => {
    if (
      status !== "success" ||
      !coords ||
      userMovedMapRef.current ||
      hasAutoCenteredToCurrentLocationRef.current
    ) {
      return;
    }

    boundsSuppressionRef.current = {
      remaining: 1,
      emitAfter: true,
    };
    setRecenterTarget(coords);
    setMapInitialized(true);
    hasAutoCenteredToCurrentLocationRef.current = true;
  }, [coords, status]);

  return (
    <div className="relative h-full w-full">
      <button
        className="absolute right-3 top-3 z-[1000] rounded-md bg-white px-3 py-1 text-xs font-medium shadow"
        onClick={handleUseMyLocation}
        type="button"
      >
        Use my location
      </button>

      <MapContainer center={mapCenter} style={mapStyle} zoom={initialZoom}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <InteractionController
          onUserMoveMap={() => {
            userMovedMapRef.current = true;
            setUserHasMovedMap(true);
            onFocusHandled();
          }}
        />
        <InitialCenterController
          boundsSuppressionRef={boundsSuppressionRef}
          events={events}
          mapInitialized={mapInitialized}
          onMapInitialized={() => setMapInitialized(true)}
          userHasMovedMap={userHasMovedMap}
        />
        <FocusController
          boundsSuppressionRef={boundsSuppressionRef}
          eventsById={eventsById}
          markerRefs={markerRefs}
          onFocusHandled={onFocusHandled}
          pendingFocusEventId={pendingFocusEventId}
          userMovedMapRef={userMovedMapRef}
        />
        <BoundsController
          boundsSuppressionRef={boundsSuppressionRef}
          onBoundsChange={onBoundsChange}
        />
        <RecenterController target={recenterTarget} />

        <MapReadyGate>
          <MarkerClusterGroup
            iconCreateFunction={(cluster: L.MarkerCluster) =>
              makeClusterIcon(cluster.getChildCount())
            }
            maxClusterRadius={80}
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
          >
            {events.map((event) => {
              return (
                <Marker
                  eventHandlers={{
                    click: (leafletEvent) => {
                      const originalEvent = leafletEvent.originalEvent as
                        | MouseEvent
                        | undefined;
                      originalEvent?.stopPropagation();
                      originalEvent?.preventDefault();
                      onSelect(event.id, false);
                      leafletEvent.target.openPopup();
                    },
                  }}
                  icon={getMarkerIcon(event.category)}
                  key={event.id}
                  position={[event.lat, event.lng]}
                  ref={(marker) => {
                    markerRefs.current[event.id] = marker;
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        </MapReadyGate>
      </MapContainer>
    </div>
  );
}
