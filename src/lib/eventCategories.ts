export type EventCategoryGroup =
  | "Sports"
  | "Learning & Culture"
  | "Community & Jewish Life"
  | "Social"
  | "Other"
  | "Tech";

export type EventCategory =
  | "RACKET_SPORTS"
  | "SOCCER"
  | "BASKETBALL"
  | "VOLLEYBALL"
  | "RUNNING"
  | "GYM"
  | "YOGA"
  | "MARTIAL_ARTS"
  | "CYCLING"
  | "OUTDOOR_HIKE"
  | "JEEP_TRIP"
  | "PAINTBALL"
  | "BOOK_CLUB"
  | "ART_PAINTING"
  | "MUSIC_JAM"
  | "WORKSHOP"
  | "CHABAD_LESSON"
  | "TORAH_STUDY"
  | "SHABBAT_DINNER"
  | "PRAYER_GATHERING"
  | "BOARD_GAMES"
  | "COFFEE"
  | "OTHER"
  | "HACKATHON"
  | "AI_MEETUP"
  | "CODING_SESSION";

export const CATEGORY_GROUPS: Array<{
  group: EventCategoryGroup;
  options: Array<{ value: EventCategory; label: string; emoji: string }>;
}> = [
  {
    group: "Sports",
    options: [
      {
        value: "RACKET_SPORTS",
        label: "Racket sports",
        emoji: "🎾",
      },
      { value: "SOCCER", label: "Soccer", emoji: "⚽" },
      { value: "BASKETBALL", label: "Basketball", emoji: "🏀" },
      { value: "VOLLEYBALL", label: "Volleyball", emoji: "🏐" },
      { value: "RUNNING", label: "Running", emoji: "🏃" },
      { value: "GYM", label: "Workout", emoji: "🏋️" },
      { value: "YOGA", label: "Yoga", emoji: "🧘" },
      { value: "MARTIAL_ARTS", label: "Martial arts", emoji: "🥋" },
      { value: "CYCLING", label: "Cycling", emoji: "🚴" },
      { value: "OUTDOOR_HIKE", label: "Outdoor activity / hike", emoji: "🏕️" },
      { value: "JEEP_TRIP", label: "Jeep trip / off-road", emoji: "🚙" },
      { value: "PAINTBALL", label: "Paintball", emoji: "🎯" },
    ],
  },
  {
    group: "Learning & Culture",
    options: [
      { value: "BOOK_CLUB", label: "Book club", emoji: "📚" },
      { value: "ART_PAINTING", label: "Art / painting", emoji: "🎨" },
      { value: "MUSIC_JAM", label: "Music jam / rehearsal", emoji: "🎵" },
      { value: "WORKSHOP", label: "Workshop", emoji: "🛠️" },
    ],
  },
  {
    group: "Community & Jewish Life",
    options: [
      { value: "CHABAD_LESSON", label: "Chabad lesson", emoji: "✡️" },
      { value: "TORAH_STUDY", label: "Torah study", emoji: "📖" },
      { value: "SHABBAT_DINNER", label: "Shabbat dinner", emoji: "🕯️" },
      { value: "PRAYER_GATHERING", label: "Prayer gathering", emoji: "🙏" },
    ],
  },
  {
    group: "Social",
    options: [
      { value: "BOARD_GAMES", label: "Board games", emoji: "🎲" },
      { value: "COFFEE", label: "Coffee meetup", emoji: "☕" },
    ],
  },
  {
    group: "Other",
    options: [
      { value: "OTHER", label: "Other", emoji: "🧩" },
    ],
  },
  {
    group: "Tech",
    options: [
      { value: "HACKATHON", label: "Hackathon", emoji: "💻" },
      { value: "AI_MEETUP", label: "AI meetup", emoji: "🤖" },
      { value: "CODING_SESSION", label: "Coding session", emoji: "🧑‍💻" },
    ],
  },
];

export const CATEGORY_OPTIONS = CATEGORY_GROUPS.flatMap((group) => group.options);

export function isValidCategory(value: string): value is EventCategory {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

export function getCategoryMeta(category: EventCategory): {
  label: string;
  emoji: string;
} {
  const found = CATEGORY_OPTIONS.find((option) => option.value === category);

  if (found) {
    return { label: found.label, emoji: found.emoji };
  }

  return { label: "Unknown", emoji: "📍" };
}

export function getCategoryDisplay(
  category: EventCategory,
  customTitle?: string | null,
): { label: string; emoji: string } {
  const meta = getCategoryMeta(category);

  if (category === "OTHER" && customTitle?.trim()) {
    return { label: customTitle.trim(), emoji: meta.emoji };
  }

  return meta;
}
