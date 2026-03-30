import { db } from "@/src/lib/db";
import {
  getCategoryDisplay,
  isValidCategory,
} from "@/src/lib/eventCategories";
import type { EventCard } from "@/lib/types/meetmap-discovery";
import { normalizeCity } from "@/src/lib/cities";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toEventCard(event: {
  id: string;
  title: string;
  city: string | null;
  category: string;
  customCategoryTitle: string | null;
  dateISO: string | null;
  description: string | null;
}): EventCard {
  const categoryDisplay = isValidCategory(event.category)
    ? getCategoryDisplay(event.category, event.customCategoryTitle)
    : { label: event.category, emoji: "📍" };

  return {
    id: event.id,
    title: event.title,
    city: event.city ?? "Unknown area",
    category: categoryDisplay.label,
    startsAt: event.dateISO ?? "",
    description: event.description?.trim() || "No description provided.",
  };
}

function matchesDateText(startsAt: string, dateText?: string | null) {
  const normalizedDateText = normalizeText(dateText);
  if (!normalizedDateText) {
    return true;
  }

  const eventDate = new Date(startsAt);
  if (Number.isNaN(eventDate.getTime())) {
    return false;
  }

  const weekday = eventDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const month = eventDate.toLocaleDateString("en-US", { month: "long" }).toLowerCase();
  const dateOnly = startsAt.slice(0, 10).toLowerCase();

  if (normalizedDateText === "today" || normalizedDateText === "tonight") {
    const today = new Date().toISOString().slice(0, 10);
    return dateOnly === today;
  }

  if (
    normalizedDateText.includes("weekend") ||
    normalizedDateText.includes("friday") ||
    normalizedDateText.includes("saturday")
  ) {
    return weekday === "friday" || weekday === "saturday";
  }

  return (
    dateOnly.includes(normalizedDateText) ||
    weekday.includes(normalizedDateText) ||
    month.includes(normalizedDateText)
  );
}

export async function getPopularEvents(input: {
  city: string;
  dateText?: string | null;
}): Promise<{ events: EventCard[] }> {
  const normalizedCity = input.city.trim();
  const canonicalCity = normalizedCity
    ? (normalizeCity(normalizedCity) ?? normalizedCity)
    : null;

  const expirationCutoffISO = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const events = await db.event.findMany({
    where: {
      ...(canonicalCity
        ? {
            city: {
              equals: canonicalCity,
              mode: "insensitive",
            },
          }
        : {}),
      OR: [
        { dateISO: null },
        {
          dateISO: {
            gte: expirationCutoffISO,
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      city: true,
      category: true,
      customCategoryTitle: true,
      dateISO: true,
      description: true,
      createdAtISO: true,
      _count: {
        select: {
          attendances: true,
        },
      },
    },
    take: 50,
  });

  const popular = events
    .filter((event) => {
      if (!event.dateISO) {
        return !input.dateText;
      }

      return matchesDateText(event.dateISO, input.dateText);
    })
    .sort((left, right) => {
      if (right._count.attendances !== left._count.attendances) {
        return right._count.attendances - left._count.attendances;
      }

      return right.createdAtISO.localeCompare(left.createdAtISO);
    })
    .slice(0, 6)
    .map(toEventCard);

  return { events: popular };
}
