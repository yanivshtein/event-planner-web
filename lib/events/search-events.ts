import { db } from "@/src/lib/db";
import {
  getCategoryDisplay,
  isValidCategory,
  type EventCategory,
} from "@/src/lib/eventCategories";
import type {
  EventCard,
  SearchEventsInput,
} from "@/lib/types/meetmap-discovery";
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

function buildCategoryMatches(categories?: string[]) {
  const normalized = Array.isArray(categories)
    ? categories.map((category) => normalizeText(category)).filter(Boolean)
    : [];

  if (normalized.length === 0) {
    return null;
  }

  const categoryMap: Record<string, EventCategory[]> = {
    music: ["MUSIC_JAM"],
    food: ["COFFEE", "SHABBAT_DINNER"],
    art: ["ART_PAINTING", "BOOK_CLUB", "WORKSHOP"],
    social: ["BOARD_GAMES", "COFFEE", "SHABBAT_DINNER"],
    sports: [
      "RACKET_SPORTS",
      "SOCCER",
      "BASKETBALL",
      "VOLLEYBALL",
      "RUNNING",
      "GYM",
      "YOGA",
      "MARTIAL_ARTS",
      "CYCLING",
      "PAINTBALL",
    ],
    outdoor: ["OUTDOOR_HIKE", "JEEP_TRIP", "CYCLING", "RUNNING"],
    hiking: ["OUTDOOR_HIKE"],
    tech: ["HACKATHON", "AI_MEETUP", "CODING_SESSION"],
    learning: ["BOOK_CLUB", "WORKSHOP", "CHABAD_LESSON", "TORAH_STUDY"],
    culture: ["BOOK_CLUB", "ART_PAINTING", "MUSIC_JAM", "WORKSHOP"],
    community: ["CHABAD_LESSON", "TORAH_STUDY", "SHABBAT_DINNER", "PRAYER_GATHERING"],
  };

  const resolved = new Set<string>();
  for (const category of normalized) {
    if (isValidCategory(category)) {
      resolved.add(category);
      continue;
    }

    const mapped = categoryMap[category];
    mapped?.forEach((value) => resolved.add(value));
  }

  return resolved.size > 0 ? [...resolved] : null;
}

export async function searchEvents(
  input: SearchEventsInput,
): Promise<{ events: EventCard[] }> {
  const normalizedCity = input.city.trim();
  const canonicalCity = normalizedCity
    ? (normalizeCity(normalizedCity) ?? normalizedCity)
    : null;

  const matchedCategories = buildCategoryMatches(input.categories);
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
      ...(matchedCategories
        ? {
            category: {
              in: matchedCategories,
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
    },
    orderBy: [
      { dateISO: "asc" },
      { createdAtISO: "desc" },
    ],
    take: 50,
  });

  const matches = events
    .filter((event) => {
      if (!event.dateISO) {
        return !input.dateText;
      }

      return matchesDateText(event.dateISO, input.dateText);
    })
    .map(toEventCard);

  return { events: matches };
}
