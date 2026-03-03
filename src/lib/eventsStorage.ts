import type { Event } from "@/src/types/event";

const EVENTS_STORAGE_KEY = "event-planner.events";

export function loadEvents(): Event[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as Event[];
  } catch {
    return [];
  }
}

export function saveEvents(events: Event[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
}
