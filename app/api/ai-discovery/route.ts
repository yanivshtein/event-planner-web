import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  buildMeetMapRankingPrompt,
  meetMapIntentPrompt,
} from "@/lib/ai/system-prompt";
import { getPopularEvents } from "@/lib/events/get-popular-events";
import { searchEvents } from "@/lib/events/search-events";
import type {
  DiscoveryResult,
  EventCard,
} from "@/lib/types/meetmap-discovery";
import { getUserSettings } from "@/lib/user/get-user-settings";
import { getAuthSession } from "@/src/lib/auth";
import { findCityInText } from "@/src/lib/cities";
import { getCategoryMeta, isValidCategory } from "@/src/lib/eventCategories";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_QUERY_LENGTH = 400;
const AI_DISCOVERY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const AI_DISCOVERY_RATE_LIMIT_MAX_REQUESTS = 25;

type RequestBody = {
  query?: unknown;
  userId?: unknown;
  history?: unknown;
};

type DiscoveryChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type DiscoveryIntent = {
  city: string | null;
  dateText: string | null;
  primaryCategories: string[];
  secondaryCategories: string[];
  excludedCategories: string[];
  vibe: string | null;
  intentSummary: string | null;
};

type RankedDiscoveryResponse = {
  summary: string;
  events: EventCard[];
};

type AiDiscoveryRequestStatus =
  | "SUCCESS"
  | "BAD_INPUT"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

function getSessionUser(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user as { id?: string; email?: string } | undefined;
}

async function resolveUserId(
  session: Awaited<ReturnType<typeof getAuthSession>>,
) {
  const user = getSessionUser(session);

  if (user?.id) {
    return user.id;
  }

  if (user?.email) {
    const dbUser = await db.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    return dbUser?.id;
  }

  return undefined;
}

async function logAiDiscoveryRequest(input: {
  userId: string;
  queryLength: number;
  status: AiDiscoveryRequestStatus;
}) {
  try {
    await db.aiDiscoveryRequest.create({
      data: {
        userId: input.userId,
        queryLength: input.queryLength,
        status: input.status,
      },
    });
  } catch {
    // Logging should not break the main request path.
  }
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJsonObjectText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (withoutCodeFence.startsWith("{") && withoutCodeFence.endsWith("}")) {
    return withoutCodeFence;
  }

  const firstBrace = withoutCodeFence.indexOf("{");
  const lastBrace = withoutCodeFence.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return withoutCodeFence.slice(firstBrace, lastBrace + 1);
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIntent(value: unknown): DiscoveryIntent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    city: normalizeOptionalString(candidate.city),
    dateText: normalizeOptionalString(candidate.dateText),
    primaryCategories: Array.isArray(candidate.primaryCategories)
      ? candidate.primaryCategories
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [],
    secondaryCategories: Array.isArray(candidate.secondaryCategories)
      ? candidate.secondaryCategories
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [],
    excludedCategories: Array.isArray(candidate.excludedCategories)
      ? candidate.excludedCategories
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [],
    vibe: normalizeOptionalString(candidate.vibe),
    intentSummary: normalizeOptionalString(candidate.intentSummary),
  };
}

function parseHistory(value: unknown): DiscoveryChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const role =
        item.role === "assistant" || item.role === "user" ? item.role : null;
      const content =
        typeof item.content === "string" ? item.content.trim() : "";

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is DiscoveryChatMessage => item !== null)
    .slice(-8);
}

function isEventCard(value: unknown): value is EventCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.city === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.startsAt === "string" &&
    typeof candidate.description === "string"
  );
}

function parseRankedDiscoveryResponse(value: unknown): RankedDiscoveryResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string" || !Array.isArray(candidate.events)) {
    return null;
  }

  const events = candidate.events.filter(isEventCard);
  return {
    summary: candidate.summary,
    events,
  };
}

function uniqueEvents(events: EventCard[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false;
    }

    seen.add(event.id);
    return true;
  });
}

async function generateGeminiJson(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
) {
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const extractedJson = extractJsonObjectText(text);

  if (!extractedJson) {
    return null;
  }

  return parseJsonObject(extractedJson);
}

function normalizeCategories(categories: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const category of categories) {
    const trimmed = category.trim();
    if (!trimmed) {
      continue;
    }

    const normalizedKey = isValidCategory(trimmed)
      ? trimmed
      : trimmed.toLowerCase();

    if (seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    normalized.push(normalizedKey);
  }

  return normalized;
}

function getVibeDerivedCategories(vibe: string | null, query: string) {
  const text = `${vibe ?? ""} ${query}`.trim().toLowerCase();
  if (!text) {
    return [];
  }

  const derived = new Set<string>();

  const addMany = (values: string[]) => {
    values.forEach((value) => derived.add(value));
  };

  if (
    text.includes("chill") ||
    text.includes("relax") ||
    text.includes("relaxed") ||
    text.includes("low key") ||
    text.includes("low-key") ||
    text.includes("casual")
  ) {
    addMany(["COFFEE", "BOARD_GAMES", "BOOK_CLUB", "YOGA"]);
  }

  if (
    text.includes("social") ||
    text.includes("meet people") ||
    text.includes("meet new people") ||
    text.includes("hang out") ||
    text.includes("hangout")
  ) {
    addMany(["COFFEE", "BOARD_GAMES", "SHABBAT_DINNER"]);
  }

  if (
    text.includes("quiet") ||
    text.includes("calm") ||
    text.includes("peaceful")
  ) {
    addMany(["BOOK_CLUB", "COFFEE", "YOGA"]);
  }

  if (
    text.includes("creative") ||
    text.includes("artsy") ||
    text.includes("art")
  ) {
    addMany(["ART_PAINTING", "WORKSHOP", "BOOK_CLUB"]);
  }

  return [...derived];
}

function getQueryDerivedIntent(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return {
      primaryCategories: [] as string[],
      secondaryCategories: [] as string[],
    };
  }

  if (
    normalizedQuery.includes("workout") ||
    normalizedQuery.includes("gym") ||
    normalizedQuery.includes("fitness") ||
    normalizedQuery.includes("lift") ||
    normalizedQuery.includes("training")
  ) {
    return {
      primaryCategories: ["GYM"],
      secondaryCategories: ["RUNNING", "YOGA", "MARTIAL_ARTS"],
    };
  }

  if (
    normalizedQuery.includes("run") ||
    normalizedQuery.includes("jog")
  ) {
    return {
      primaryCategories: ["RUNNING"],
      secondaryCategories: ["GYM", "YOGA", "CYCLING"],
    };
  }

  return {
    primaryCategories: [] as string[],
    secondaryCategories: [] as string[],
  };
}

function selectValidatedEvents(
  candidateEvents: EventCard[],
  availableEvents: Map<string, EventCard>,
) {
  const validated: EventCard[] = [];
  const seen = new Set<string>();

  for (const event of candidateEvents) {
    const toolBackedEvent = availableEvents.get(event.id);
    if (!toolBackedEvent || seen.has(toolBackedEvent.id)) {
      continue;
    }

    seen.add(toolBackedEvent.id);
    validated.push(toolBackedEvent);
  }

  return validated;
}

function appendCityHint(summary: string) {
  if (summary.toLowerCase().includes("narrow it down to a city")) {
    return summary;
  }

  return `${summary} If you narrow it down to a city, I can give you more relevant local picks.`;
}

function appendBroaderResultsHint(summary: string, city: string) {
  if (summary.toLowerCase().includes("showing broader")) {
    return summary;
  }

  return `${summary} I could not find enough activities in ${city}, so I am showing broader MeetMap picks as well.`;
}

function formatConversationHistory(history: DiscoveryChatMessage[]) {
  if (history.length === 0) {
    return "";
  }

  return history
    .map((message) =>
      `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n");
}

function buildPreferredCategoryLabels(categories: string[]) {
  const labels = new Set<string>();

  for (const category of categories) {
    if (!isValidCategory(category)) {
      continue;
    }

    labels.add(getCategoryMeta(category).label.toLowerCase());
  }

  return labels;
}

function eventMatchesPreferredCategory(
  event: EventCard,
  preferredCategoryLabels: Set<string>,
) {
  const normalizedCategory = event.category.trim().toLowerCase();
  if (!normalizedCategory || preferredCategoryLabels.size === 0) {
    return false;
  }

  for (const label of preferredCategoryLabels) {
    if (
      normalizedCategory === label ||
      normalizedCategory.includes(label) ||
      label.includes(normalizedCategory)
    ) {
      return true;
    }
  }

  return false;
}

function prioritizeEvents(
  events: EventCard[],
  primaryCategories: string[],
  secondaryCategories: string[],
) {
  const primaryLabels = buildPreferredCategoryLabels(primaryCategories);
  const secondaryLabels = buildPreferredCategoryLabels(secondaryCategories);

  if (primaryLabels.size === 0 && secondaryLabels.size === 0) {
    return events;
  }

  return [...events].sort((left, right) => {
    const leftPrimary = eventMatchesPreferredCategory(left, primaryLabels) ? 2 : 0;
    const rightPrimary = eventMatchesPreferredCategory(right, primaryLabels) ? 2 : 0;
    const leftSecondary = eventMatchesPreferredCategory(left, secondaryLabels) ? 1 : 0;
    const rightSecondary = eventMatchesPreferredCategory(right, secondaryLabels) ? 1 : 0;
    const leftScore = leftPrimary + leftSecondary;
    const rightScore = rightPrimary + rightSecondary;

    if (leftScore === rightScore) {
      return 0;
    }

    return rightScore - leftScore;
  });
}

function excludeEvents(events: EventCard[], excludedCategories: string[]) {
  const excludedLabels = buildPreferredCategoryLabels(excludedCategories);
  if (excludedLabels.size === 0) {
    return events;
  }

  return events.filter((event) => !eventMatchesPreferredCategory(event, excludedLabels));
}

export async function POST(request: Request) {
  let sessionUserId: string | undefined;
  let queryLengthForLogging = 0;

  try {
    const session = await getAuthSession();
    sessionUserId = await resolveUserId(session);

    if (!sessionUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    queryLengthForLogging = query.length;
    const history = parseHistory(body.history);
    const conversationHistory = formatConversationHistory(history);

    if (!query) {
      await logAiDiscoveryRequest({
        userId: sessionUserId,
        queryLength: queryLengthForLogging,
        status: "BAD_INPUT",
      });
      return NextResponse.json(
        { error: "Query must be a non-empty string." },
        { status: 400 },
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      await logAiDiscoveryRequest({
        userId: sessionUserId,
        queryLength: queryLengthForLogging,
        status: "BAD_INPUT",
      });
      return NextResponse.json(
        {
          error: `Query is too long. Please keep it under ${MAX_QUERY_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const rateLimitWindowStart = new Date(
      Date.now() - AI_DISCOVERY_RATE_LIMIT_WINDOW_MS,
    );
    const recentRequestCount = await db.aiDiscoveryRequest.count({
      where: {
        userId: sessionUserId,
        createdAt: {
          gte: rateLimitWindowStart,
        },
      },
    });

    if (recentRequestCount >= AI_DISCOVERY_RATE_LIMIT_MAX_REQUESTS) {
      await logAiDiscoveryRequest({
        userId: sessionUserId,
        queryLength: queryLengthForLogging,
        status: "RATE_LIMITED",
      });
      return NextResponse.json(
        {
          error:
            "AI discovery limit reached. Please wait a bit before trying again.",
        },
        { status: 429 },
      );
    }

    const userSettings = await getUserSettings(sessionUserId);

    let geminiModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;
    if (process.env.GEMINI_API_KEY) {
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      geminiModel = gemini.getGenerativeModel({ model: GEMINI_MODEL });
    }

    let intent: DiscoveryIntent = {
      city: null,
      dateText: null,
      primaryCategories: [],
      secondaryCategories: [],
      excludedCategories: [],
      vibe: null,
      intentSummary: null,
    };

    try {
      if (geminiModel) {
        const parsedIntent = await generateGeminiJson(
          geminiModel,
          `${meetMapIntentPrompt}\n\nConversation context:\n${conversationHistory || "No prior messages"}\n\nLatest user query:\n${query}`,
        );
        const safeIntent = parseIntent(parsedIntent);
        if (safeIntent) {
          intent = safeIntent;
        }
      }
    } catch {
      // Fall back to safe defaults if Gemini intent extraction fails.
    }

    const queryDetectedCity = findCityInText(query);
    const resolvedCity =
      intent.city?.trim() ||
      queryDetectedCity ||
      userSettings.homeCity?.trim() ||
      "";
    const hasResolvedCity = resolvedCity.length > 0;
    const usedCity = hasResolvedCity ? resolvedCity : "Across MeetMap";
    const primaryIntentCategories = normalizeCategories(intent.primaryCategories);
    const secondaryIntentCategories = normalizeCategories(intent.secondaryCategories);
    const excludedIntentCategories = normalizeCategories(intent.excludedCategories);
    const queryDerivedIntent = getQueryDerivedIntent(query);
    const queryDerivedPrimaryCategories = normalizeCategories(
      queryDerivedIntent.primaryCategories,
    );
    const queryDerivedSecondaryCategories = normalizeCategories(
      queryDerivedIntent.secondaryCategories,
    );
    const vibeCategories = normalizeCategories(
      getVibeDerivedCategories(intent.vibe, query),
    );
    const preferenceCategories = normalizeCategories(
      userSettings.interestedActivities,
    );
    const resolvedPrimaryCategories =
      primaryIntentCategories.length > 0
        ? normalizeCategories([...primaryIntentCategories, ...vibeCategories])
        : queryDerivedPrimaryCategories.length > 0
          ? normalizeCategories([...queryDerivedPrimaryCategories, ...vibeCategories])
        : vibeCategories.length > 0
          ? vibeCategories
          : preferenceCategories;
    const resolvedSecondaryCategories =
      primaryIntentCategories.length > 0 || secondaryIntentCategories.length > 0
        ? normalizeCategories(secondaryIntentCategories)
        : queryDerivedSecondaryCategories.length > 0
          ? queryDerivedSecondaryCategories
        : [];
    const resolvedCategories = normalizeCategories([
      ...resolvedPrimaryCategories,
      ...resolvedSecondaryCategories,
    ]);
    const usedPreferences =
      primaryIntentCategories.length === 0 &&
      secondaryIntentCategories.length === 0 &&
      queryDerivedPrimaryCategories.length === 0 &&
      queryDerivedSecondaryCategories.length === 0 &&
      vibeCategories.length === 0 &&
      resolvedCategories.length > 0;

    const { events: initialEvents } = await searchEvents({
      city: resolvedCity,
      dateText: intent.dateText,
      categories: resolvedCategories.length > 0 ? resolvedCategories : undefined,
    });

    let fallbackUsed: DiscoveryResult["fallbackUsed"] = "none";
    let mergedEvents = [...initialEvents];
    let broadenedBeyondCity = false;

    if (mergedEvents.length < 3) {
      const { events: fallbackEvents } = await getPopularEvents({
        city: resolvedCity,
        dateText: intent.dateText,
      });
      mergedEvents = uniqueEvents([...mergedEvents, ...fallbackEvents]);
      fallbackUsed = fallbackEvents.length > 0 ? "popular-events" : "none";
    }

    if (hasResolvedCity && mergedEvents.length === 0) {
      const { events: broaderMatches } = await searchEvents({
        city: "",
        dateText: intent.dateText,
        categories: resolvedCategories.length > 0 ? resolvedCategories : undefined,
      });
      const { events: broaderPopular } = await getPopularEvents({
        city: "",
        dateText: intent.dateText,
      });

      mergedEvents = uniqueEvents([...broaderMatches, ...broaderPopular]);
      broadenedBeyondCity = mergedEvents.length > 0;
      if (mergedEvents.length > 0) {
        fallbackUsed = "popular-events";
      }
    }

    mergedEvents = excludeEvents(mergedEvents, excludedIntentCategories);
    mergedEvents = prioritizeEvents(
      mergedEvents,
      resolvedPrimaryCategories,
      resolvedSecondaryCategories,
    );

    const availableEvents = new Map(mergedEvents.map((event) => [event.id, event]));
    let rankedEvents = mergedEvents.slice(0, 5);
    let summary =
      rankedEvents.length > 0
        ? hasResolvedCity
          ? broadenedBeyondCity
            ? `I could not find matching activities in ${usedCity}, so here are some broader MeetMap picks that still fit your search.`
            : `Here are some MeetMap activities in ${usedCity} that match your search.`
          : "Here are some MeetMap activities that match your search. If you narrow it down to a city, I can give you more relevant local picks."
        : hasResolvedCity
          ? `No MeetMap activities were found in ${usedCity} for this search.`
          : "I could not find matching MeetMap activities right now. If you narrow it down to a city, I can give you more relevant local picks.";

    try {
      if (geminiModel && mergedEvents.length > 0) {
        const rankedPayload = await generateGeminiJson(
          geminiModel,
          buildMeetMapRankingPrompt({
            query,
            conversationHistory,
            usedCity,
            primaryCategories: resolvedPrimaryCategories,
            secondaryCategories: resolvedSecondaryCategories,
            excludedCategories: excludedIntentCategories,
            vibe: intent.vibe,
            intentSummary: intent.intentSummary,
            eventsJson: JSON.stringify(mergedEvents),
          }),
        );
        const rankedResponse = parseRankedDiscoveryResponse(rankedPayload);

        if (rankedResponse?.summary?.trim()) {
          summary = rankedResponse.summary.trim();
          if (broadenedBeyondCity) {
            summary = appendBroaderResultsHint(summary, usedCity);
          }
          if (!hasResolvedCity) {
            summary = appendCityHint(summary);
          }
        }

        if (rankedResponse) {
          const validatedRankedEvents = selectValidatedEvents(
            rankedResponse.events,
            availableEvents,
          );
          if (validatedRankedEvents.length > 0) {
            rankedEvents = prioritizeEvents(
              validatedRankedEvents,
              resolvedPrimaryCategories,
              resolvedSecondaryCategories,
            ).slice(0, 5);
          }
        }
      }
    } catch {
      // Keep tool-backed events even if Gemini ranking fails.
    }

    if (rankedEvents.length === 0 && mergedEvents.length > 0) {
      rankedEvents = mergedEvents.slice(0, 5);
    }

    const response: DiscoveryResult = {
      summary,
      usedCity,
      usedPreferences,
      fallbackUsed,
      events: rankedEvents,
    };

    await logAiDiscoveryRequest({
      userId: sessionUserId,
      queryLength: queryLengthForLogging,
      status: "SUCCESS",
    });

    return NextResponse.json(response);
  } catch (error) {
    if (sessionUserId) {
      await logAiDiscoveryRequest({
        userId: sessionUserId,
        queryLength: queryLengthForLogging,
        status: "SERVER_ERROR",
      });
    }

    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while running AI discovery."
            : `Server error while running AI discovery: ${message}`,
      },
      { status: 500 },
    );
  }
}
