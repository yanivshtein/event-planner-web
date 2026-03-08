"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomEventCard from "@/src/components/BottomEventCard";
import MapEventsClient from "@/src/components/MapEventsClient";
import type { MapBounds } from "@/src/components/MapEvents";
import { debounce } from "@/src/lib/debounce";
import { makeCacheKey } from "@/src/lib/eventsCache";
import {
  CATEGORY_GROUPS,
  getCategoryDisplay,
  type EventCategory,
} from "@/src/lib/eventCategories";
import {
  fetchEvents,
  type EventsBounds,
  type EventsFilters,
} from "@/src/lib/eventsApi";
import { useSessionClient } from "@/src/lib/sessionClient";
import type { Event } from "@/src/types/event";

const BOUNDS_PRECISION = 3;
const MAP_INITIAL_CENTER: [number, number] = [32.0853, 34.7818];

function roundToPrecision(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeBounds(bounds: MapBounds): EventsBounds {
  return {
    north: roundToPrecision(bounds.north, BOUNDS_PRECISION),
    south: roundToPrecision(bounds.south, BOUNDS_PRECISION),
    east: roundToPrecision(bounds.east, BOUNDS_PRECISION),
    west: roundToPrecision(bounds.west, BOUNDS_PRECISION),
  };
}

function sameEventIdsInOrder(a: Event[], b: Event[]) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) {
      return false;
    }
  }

  return true;
}

export default function HomePage() {
  const { isAuthenticated, userId } = useSessionClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pendingFocusEventId, setPendingFocusEventId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<EventsFilters>({});
  const [bounds, setBounds] = useState<EventsBounds | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);

  const handleBoundsChange = useCallback((nextBounds: MapBounds) => {
    const rounded = normalizeBounds(nextBounds);

    setBounds((prev) => {
      if (
        prev &&
        prev.north === rounded.north &&
        prev.south === rounded.south &&
        prev.east === rounded.east &&
        prev.west === rounded.west
      ) {
        return prev;
      }

      return rounded;
    });
  }, []);
  const handleSelectEvent = useCallback((id: string, shouldFocus = true) => {
    setSelectedEventId(id);
    setPendingFocusEventId(shouldFocus ? id : null);
  }, []);
  const handleFocusHandled = useCallback(() => {
    setPendingFocusEventId(null);
  }, []);
  const handleDeletedEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    setPendingFocusEventId((prev) => (prev === id ? null : prev));
    setSelectedEventId((prev) => (prev === id ? null : prev));
  }, []);
  const handleDeleteSelectedEvent = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/events/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          return;
        }
        handleDeletedEvent(id);
      } catch {
        // Keep UI stable if API delete fails.
      }
    },
    [handleDeletedEvent],
  );

  const loadEvents = useCallback(
    async (nextFilters: EventsFilters, nextBounds: EventsBounds | null) => {
      const requestParams = {
        ...nextFilters,
        ...(nextBounds ?? {}),
      };
      const fetchKey = makeCacheKey(requestParams);
      if (lastFetchKeyRef.current === fetchKey) {
        return;
      }

      lastFetchKeyRef.current = fetchKey;
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await fetchEvents(requestParams, controller.signal);
        setEvents((prev) => {
          if (sameEventIdsInOrder(prev, data)) {
            return prev;
          }

          return data;
        });
        setSelectedEventId((prev) => {
          if (!prev) {
            return null;
          }

          const stillExists = data.some((event) => event.id === prev);
          return stillExists ? prev : null;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        lastFetchKeyRef.current = null;
        setLoadError("Failed to load events.");
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  const debouncedLoadEvents = useMemo(
    () =>
      debounce((nextFilters: EventsFilters, nextBounds: EventsBounds | null) => {
        void loadEvents(nextFilters, nextBounds);
      }, 300),
    [loadEvents],
  );

  useEffect(() => {
    debouncedLoadEvents(filters, bounds);
    return () => {
      abortRef.current?.abort();
    };
  }, [bounds, debouncedLoadEvents, filters]);

  useEffect(() => {
    if (events.length === 0) {
      setIsMobileListOpen(false);
    }
  }, [events.length]);

  const hasActiveFilters = Boolean(
    filters.q?.trim() || filters.from || filters.to || filters.category,
  );
  const selectedCategory = filters.category
      ? CATEGORY_GROUPS.flatMap((group) => group.options).find(
        (option) => option.value === filters.category,
      )
    : null;
  const selectedEvent = selectedEventId
    ? events.find((event) => event.id === selectedEventId) ?? null
    : null;
  const emptyTitle = hasActiveFilters
    ? "No activities match your current filters"
    : "No activities in this area yet";
  const emptySubtitle = hasActiveFilters
    ? selectedCategory
      ? `Try removing some filters or changing the map area. No ${selectedCategory.label.toLowerCase()} events found here right now.`
      : "Try removing some filters or changing the map area."
    : "Be the first to create one!";

  const renderEventsList = (containerClassName?: string) => (
    <div className={["ui-card-static space-y-3", containerClassName].join(" ")}>
      <h3 className="section-title text-lg">Activities in this area</h3>
      <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {events.map((event) => {
          const categoryMeta = getCategoryDisplay(
            event.category,
            event.customCategoryTitle,
          );
          const isSelected = selectedEventId === event.id;

          return (
            <li key={event.id}>
              <button
                className={[
                  "w-full rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:shadow-sm",
                  isSelected ? "border-indigo-300 bg-indigo-50/60" : "",
                ].join(" ")}
                onClick={() => handleSelectEvent(event.id)}
                type="button"
              >
                <p className="text-sm text-gray-600">
                  {categoryMeta.emoji} {categoryMeta.label}
                </p>
                <p className="font-medium text-gray-900">{event.title}</p>
                {event.city ? (
                  <p className="text-sm text-gray-600">📍 {event.city}</p>
                ) : null}
                {event.dateISO ? (
                  <p className="text-sm text-gray-600">
                    🕒 {new Date(event.dateISO).toLocaleString()}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <main className="app-shell page-stack">
      <section className="ui-card-static rounded-2xl bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-6 py-10 text-center md:px-10 md:py-12">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Find and organize activities around you
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 md:text-lg">
          Discover events, meet people, and create your own activities.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {[
            "⚽ Sports",
            "📚 Learning",
            "💻 Coding",
            "🥾 Outdoor",
          ].map((item) => (
            <span
              className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          {isAuthenticated ? (
            <Link
              className="btn-primary px-6 py-3 text-sm font-semibold"
              href="/create"
            >
              Create activity
            </Link>
          ) : (
            <button
              className="btn-primary px-6 py-3 text-sm font-semibold"
              onClick={() => signIn("google", { callbackUrl: "/create" })}
              type="button"
            >
              Create activity
            </button>
          )}
          <p className="text-sm text-gray-500">
            Click on the map to explore events near you.
          </p>
        </div>
      </section>

      {!isAuthenticated ? (
        <p className="body-muted">
          Sign in to create events. Viewing events is public.
        </p>
      ) : null}

      {loadError ? <p className="body-muted text-red-600">{loadError}</p> : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <input
            className="input-base !w-auto flex-1 !rounded-full !px-4 !py-2"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, q: e.target.value || undefined }))
            }
            placeholder="Search title or address…"
            type="text"
            value={filters.q ?? ""}
          />
          <input
            className="input-base !w-auto !rounded-full !px-4 !py-2"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, from: e.target.value || undefined }))
            }
            type="date"
            value={filters.from ?? ""}
          />
          <input
            className="input-base !w-auto !rounded-full !px-4 !py-2"
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, to: e.target.value || undefined }))
            }
            type="date"
            value={filters.to ?? ""}
          />
          <select
            className="input-base !w-auto min-w-44 !rounded-full !px-4 !py-2"
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                category: (e.target.value || undefined) as
                  | EventCategory
                  | undefined,
              }))
            }
            value={filters.category ?? ""}
          >
            <option value="">All categories</option>
            {CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.emoji} {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="section-title">Explore activities near you</h2>
            <p className="body-muted mt-1">
              Discover sports, meetups, study groups and community events.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="relative h-[75vh] min-h-[480px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
              {isLoading ? (
                <div className="absolute left-3 top-3 z-[1000] rounded-md bg-white/95 px-3 py-1 text-xs font-medium shadow">
                  Loading events...
                </div>
              ) : null}

              {events.length > 0 ? (
                <button
                  className="btn-secondary absolute bottom-3 left-3 z-[1000] lg:hidden"
                  onClick={() => setIsMobileListOpen((prev) => !prev)}
                  type="button"
                >
                  {isMobileListOpen ? "Hide list" : `Show list (${events.length})`}
                </button>
              ) : null}

              <MapEventsClient
                events={events}
                initialCenter={MAP_INITIAL_CENTER}
                initialZoom={13}
                onBoundsChange={handleBoundsChange}
                onFocusHandled={handleFocusHandled}
                onSelect={handleSelectEvent}
                pendingFocusEventId={pendingFocusEventId}
              />

              {events.length > 0 && isMobileListOpen ? (
                <div className="absolute inset-x-3 bottom-3 z-[1000] max-h-[55%] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl lg:hidden">
                  {renderEventsList("h-full border-0 shadow-none")}
                </div>
              ) : null}
            </div>

            {!isLoading && events.length > 0 ? (
              <div className="hidden lg:block">{renderEventsList()}</div>
            ) : null}
            {!isLoading && events.length === 0 ? (
              <div className="hidden lg:block">
                <div className="ui-card-static text-center">
                  <p className="text-base font-semibold text-gray-900">{emptyTitle}</p>
                  <p className="body-muted mt-1">{emptySubtitle}</p>
                  <div className="mt-4">
                    {isAuthenticated ? (
                      <Link className="btn-primary" href="/create">
                        Create activity
                      </Link>
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={() => signIn("google", { callbackUrl: "/create" })}
                        type="button"
                      >
                        Create activity
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {!isLoading && events.length === 0 ? (
            <div className="ui-card-static text-center lg:hidden">
              <p className="text-base font-semibold text-gray-900">{emptyTitle}</p>
              <p className="body-muted mt-1">{emptySubtitle}</p>
              <div className="mt-4">
                {isAuthenticated ? (
                  <Link className="btn-primary" href="/create">
                    Create activity
                  </Link>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => signIn("google", { callbackUrl: "/create" })}
                    type="button"
                  >
                    Create activity
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="fixed inset-x-4 bottom-4 z-[1100] sm:inset-x-auto sm:bottom-6 sm:right-6">
        {isAuthenticated ? (
          <Link className="btn-primary w-full rounded-full px-5 py-3 shadow-lg sm:w-auto" href="/create">
            + Create activity
          </Link>
        ) : (
          <button
            className="btn-primary w-full rounded-full px-5 py-3 shadow-lg sm:w-auto"
            onClick={() => signIn("google", { callbackUrl: "/create" })}
            type="button"
          >
            + Create activity
          </button>
        )}
      </div>

      <BottomEventCard
        event={selectedEvent}
        isOwner={Boolean(userId && selectedEvent?.userId === userId)}
        onClose={() => {
          setSelectedEventId(null);
          setPendingFocusEventId(null);
        }}
        onDelete={handleDeleteSelectedEvent}
      />
    </main>
  );
}
