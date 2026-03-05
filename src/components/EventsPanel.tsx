"use client";

import {
  CATEGORY_GROUPS,
  type EventCategory,
  getCategoryDisplay,
} from "@/src/lib/eventCategories";
import type { EventsFilters } from "@/src/lib/eventsApi";
import type { Event } from "@/src/types/event";

type EventsPanelProps = {
  events: Event[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
  onFiltersChange: (filters: EventsFilters) => void;
  filters: EventsFilters;
};

export default function EventsPanel({
  events,
  selectedEventId,
  onSelect,
  onFiltersChange,
  filters,
}: EventsPanelProps) {
  const q = filters.q ?? "";
  const from = filters.from ?? "";
  const to = filters.to ?? "";
  const category = filters.category ?? "";

  const emitFilters = (next: {
    q: string;
    from: string;
    to: string;
    category: string;
  }) => {
    onFiltersChange({
      q: next.q || undefined,
      from: next.from || undefined,
      to: next.to || undefined,
      category: (next.category || undefined) as EventCategory | undefined,
    });
  };

  return (
    <aside className="flex h-full flex-col rounded-xl border bg-white">
      <div className="space-y-3 border-b p-4">
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(e) => {
            const next = { q: e.target.value, from, to, category };
            emitFilters(next);
          }}
          placeholder="Search title or address…"
          type="text"
          value={q}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            onChange={(e) => {
              const next = { q, from: e.target.value, to, category };
              emitFilters(next);
            }}
            type="date"
            value={from}
          />
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            onChange={(e) => {
              const next = { q, from, to: e.target.value, category };
              emitFilters(next);
            }}
            type="date"
            value={to}
          />
        </div>

        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(e) => {
            const next = { q, from, to, category: e.target.value };
            emitFilters(next);
          }}
          value={category}
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No events found.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => {
              const isSelected = selectedEventId === event.id;
              const meta = getCategoryDisplay(
                event.category,
                event.customCategoryTitle,
              );

              return (
                <li key={event.id}>
                  <button
                    className={[
                      "w-full rounded-lg border p-3 text-left",
                      isSelected
                        ? "border-black bg-gray-50"
                        : "border-transparent hover:border-gray-200",
                    ].join(" ")}
                    onClick={() => onSelect(event.id)}
                    type="button"
                  >
                    <p className="text-sm text-gray-600">
                      {meta.emoji} {meta.label}
                    </p>
                    <p className="font-medium">{event.title}</p>
                    {event.address ? (
                      <p className="text-sm text-gray-600">{event.address}</p>
                    ) : null}
                    {event.dateISO ? (
                      <p className="text-sm text-gray-500">
                        {new Date(event.dateISO).toLocaleString()}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
