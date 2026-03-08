"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getCategoryDisplay } from "@/src/lib/eventCategories";
import type { Event } from "@/src/types/event";

type BottomEventCardProps = {
  event: Event | null;
  isOwner: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
};

export default function BottomEventCard({
  event,
  isOwner,
  onClose,
  onDelete,
}: BottomEventCardProps) {
  const categoryMeta = useMemo(
    () =>
      event
        ? getCategoryDisplay(event.category, event.customCategoryTitle)
        : null,
    [event],
  );
  const formattedDate = event?.dateISO
    ? new Date(event.dateISO).toLocaleString()
    : null;
  const attendeeCount = event?.attendanceCount ?? event?._count?.attendances;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1200] flex justify-center px-0 sm:bottom-6 sm:px-4">
      <div
        className={[
          "pointer-events-auto transform border bg-white shadow-xl transition duration-200",
          "w-full max-w-none rounded-t-2xl p-5 sm:w-[90%] sm:max-w-xl sm:rounded-2xl",
          event
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none",
        ].join(" ")}
      >
        {event ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xl font-semibold text-gray-900">
                {categoryMeta?.emoji ?? "📍"} {event.title}
              </p>
              <button
                aria-label="Close event card"
                className="text-xl leading-none text-gray-500 transition hover:text-gray-800"
                onClick={onClose}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-1 text-sm text-gray-600">
              {event.city ? <p>📍 {event.city}</p> : null}
              {formattedDate ? <p>🕒 {formattedDate}</p> : null}
              {typeof attendeeCount === "number" ? (
                <p>👥 {attendeeCount} attending</p>
              ) : null}
            </div>

            <Link
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white no-underline transition hover:bg-indigo-700"
              href={`/events/${event.id}`}
            >
              View details
            </Link>

            {isOwner ? (
              <div className="flex gap-4 text-sm">
                <Link
                  className="font-medium text-gray-600 no-underline transition hover:text-gray-900"
                  href={`/edit/${event.id}`}
                >
                  Edit
                </Link>
                <button
                  className="font-medium text-red-500 transition hover:text-red-700"
                  onClick={() => onDelete(event.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
