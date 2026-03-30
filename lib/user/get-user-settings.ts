import { db } from "@/src/lib/db";
import type { UserSettings } from "@/lib/types/meetmap-discovery";

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return {
      homeCity: null,
      interestedActivities: [],
    };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        homeTown: true,
        interestedCategories: true,
      },
    });

    if (!user) {
      return {
        homeCity: null,
        interestedActivities: [],
      };
    }

    return {
      homeCity: user.homeTown ?? null,
      interestedActivities: user.interestedCategories,
    };
  } catch {
    return {
      homeCity: null,
      interestedActivities: [],
    };
  }
}
