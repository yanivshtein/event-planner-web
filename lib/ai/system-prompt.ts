import { CATEGORY_GROUPS } from "@/src/lib/eventCategories";

const CATEGORY_MEANINGS: Record<string, string> = {
  RACKET_SPORTS: "racket-based casual or competitive sports like tennis or padel",
  SOCCER: "football / soccer games or kickabouts",
  BASKETBALL: "basketball runs, games, or shooting sessions",
  VOLLEYBALL: "volleyball games, beach volleyball, or casual play",
  RUNNING: "running, jogging, or cardio-focused meetups",
  GYM: "workout, fitness training, lifting, or exercise sessions",
  YOGA: "yoga, stretching, mindfulness movement, or gentle exercise",
  MARTIAL_ARTS: "boxing, MMA, self-defense, or martial arts training",
  CYCLING: "bike rides, cycling meetups, or spinning-style activity",
  OUTDOOR_HIKE: "hiking, walking trails, and outdoor nature activity",
  JEEP_TRIP: "off-road driving, jeep trips, or outdoor driving adventures",
  PAINTBALL: "competitive paintball or tactical action games",
  BOOK_CLUB: "reading, discussion, quiet cultural meetups, or literary events",
  ART_PAINTING: "creative art, painting, drawing, or arts-and-crafts activity",
  MUSIC_JAM: "playing music, jamming, rehearsing, or informal music meetups",
  WORKSHOP: "hands-on guided learning, making, or skill-building sessions",
  CHABAD_LESSON: "Jewish learning or Chabad-centered study/community events",
  TORAH_STUDY: "Torah learning, text study, and religious discussion",
  SHABBAT_DINNER: "social Shabbat meals, hosted dinners, or warm community gatherings",
  PRAYER_GATHERING: "group prayer or spiritual gathering",
  BOARD_GAMES: "tabletop games, light social games, or low-pressure group fun",
  COFFEE: "coffee meetup, relaxed conversation, casual social hangout, or low-key meetup",
  OTHER: "miscellaneous activities that do not fit the main categories",
  HACKATHON: "building projects fast, coding sprints, or hackathon events",
  AI_MEETUP: "AI talks, AI networking, or discussion around artificial intelligence",
  CODING_SESSION: "programming, coding practice, pair coding, or developer meetups",
};

const meetMapCategoryGuide = CATEGORY_GROUPS.map((group) => {
  const lines = group.options.map(
    (option) =>
      `- ${option.value}: ${option.label} — ${CATEGORY_MEANINGS[option.value] ?? option.label}`,
  );

  return `${group.group}\n${lines.join("\n")}`;
}).join("\n\n");

export const meetMapIntentPrompt = `
You are helping MeetMap understand a user's activity-discovery request.

Extract intent from the user query and return JSON only in this exact shape:
{
  "city": string | null,
  "dateText": string | null,
  "primaryCategories": string[],
  "secondaryCategories": string[],
  "excludedCategories": string[],
  "vibe": string | null,
  "intentSummary": string | null
}

Rules:
- Return JSON only.
- If the city is not clearly stated, set city to null.
- If the date or time is not clearly stated, set dateText to null.
- primaryCategories should contain the best direct MeetMap category matches for what the user most likely wants.
- secondaryCategories can contain weaker but still relevant MeetMap category matches.
- excludedCategories should contain MeetMap category IDs only when the user clearly does not want something.
- If the user asks for something broad like "chill", "social", "active", or "learning", map that intent to the closest MeetMap categories.
- Good examples:
  - "chill" should usually put "COFFEE" in primaryCategories, with things like "BOARD_GAMES", "BOOK_CLUB", or "YOGA" as secondaryCategories if relevant.
  - "social" can map to primaryCategories like ["COFFEE", "BOARD_GAMES"] and secondaryCategories like ["SHABBAT_DINNER"].
  - "workout" should usually put "GYM" in primaryCategories, with things like "RUNNING" or "YOGA" as secondaryCategories if relevant.
  - "tech" can map to ["AI_MEETUP", "CODING_SESSION", "HACKATHON"].
- Prefer exact MeetMap category IDs from the list below.
- If no categories are clearly implied, return empty arrays.
- vibe should be a short phrase like "casual social", "quiet cultural", or null.
- intentSummary should be a short phrase describing what the user is actually looking for, such as "low-effort social activity" or "relaxed evening activity".

MeetMap categories:
${meetMapCategoryGuide}
`.trim();

export function buildMeetMapRankingPrompt(input: {
  query: string;
  conversationHistory: string;
  usedCity: string;
  primaryCategories: string[];
  secondaryCategories: string[];
  excludedCategories: string[];
  vibe: string | null;
  intentSummary: string | null;
  eventsJson: string;
}) {
  return `
You are MeetMap's AI discovery assistant.

You must help rank real MeetMap activities for the user without inventing anything.

User query:
${input.query}

Conversation context:
${input.conversationHistory || "No prior messages"}

Resolved city:
${input.usedCity}

Intent summary:
${input.intentSummary ?? "none"}

Resolved vibe:
${input.vibe ?? "none"}

Primary categories:
${input.primaryCategories.length > 0 ? input.primaryCategories.join(", ") : "none"}

Secondary categories:
${input.secondaryCategories.length > 0 ? input.secondaryCategories.join(", ") : "none"}

Excluded categories:
${input.excludedCategories.length > 0 ? input.excludedCategories.join(", ") : "none"}

Available MeetMap events JSON:
${input.eventsJson}

Choose the best 3 to 5 events from the provided list only.
Return JSON only in this exact shape:
{
  "summary": string,
  "events": EventCard[]
}

Rules:
- Never invent events.
- Only use events from the provided JSON list.
- Strongly prefer events that match the primary categories and the user's actual intent.
- Use secondary categories as backups, not as the main signal when better primary matches exist.
- Avoid excluded categories whenever possible.
- Keep the summary concise and useful.
- If there are fewer than 3 events, return all reasonable events from the list.
`.trim();
}
