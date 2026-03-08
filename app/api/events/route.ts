import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthSession } from "@/src/lib/auth";
import { findCityInText, normalizeCity } from "@/src/lib/cities";
import {
  isValidContactMethod,
  isValidContactVisibility,
} from "@/src/lib/contactMethods";
import {
  getCategoryDisplay,
  isValidCategory,
} from "@/src/lib/eventCategories";
import { db } from "@/src/lib/db";

export const dynamic = "force-dynamic";

type CreateEventBody = {
  category?: unknown;
  customCategoryTitle?: unknown;
  title?: unknown;
  autoApprove?: unknown;
  city?: unknown;
  description?: unknown;
  address?: unknown;
  dateISO?: unknown;
  contactMethod?: unknown;
  contactVisibility?: unknown;
  whatsappInviteUrl?: unknown;
  lat?: unknown;
  lng?: unknown;
};

function getSessionUser(session: Awaited<ReturnType<typeof getAuthSession>>) {
  const user = session?.user as { id?: string; email?: string } | undefined;
  return user;
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

type GeocodedLocation = {
  lat: number;
  lng: number;
  city: string | null;
};

async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": "event-planner-app",
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const results = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const first = results[0];
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    city: findCityInText(first.display_name ?? ""),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const category = searchParams.get("category")?.trim();
  const categories = searchParams.get("categories")?.trim();
  const northRaw = searchParams.get("north");
  const southRaw = searchParams.get("south");
  const eastRaw = searchParams.get("east");
  const westRaw = searchParams.get("west");

  const where: Prisma.EventWhereInput = {};

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
    ];
  }

  const categoryValues = new Set<string>();
  if (category && isValidCategory(category)) {
    categoryValues.add(category);
  }

  if (categories) {
    categories
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && isValidCategory(value))
      .forEach((value) => {
        categoryValues.add(value);
      });
  }

  if (categoryValues.size > 0) {
    where.category = {
      in: [...categoryValues],
    };
  }

  if (from || to) {
    where.dateISO = {
      not: null,
    };

    if (from) {
      const parsedFrom = new Date(from);
      if (!Number.isNaN(parsedFrom.getTime())) {
        where.dateISO.gte = parsedFrom.toISOString();
      }
    }

    if (to) {
      const parsedTo = new Date(to);
      if (!Number.isNaN(parsedTo.getTime())) {
        where.dateISO.lte = parsedTo.toISOString();
      }
    }
  }

  const parsedNorth = northRaw !== null ? Number(northRaw) : Number.NaN;
  const parsedSouth = southRaw !== null ? Number(southRaw) : Number.NaN;
  const parsedEast = eastRaw !== null ? Number(eastRaw) : Number.NaN;
  const parsedWest = westRaw !== null ? Number(westRaw) : Number.NaN;

  const hasAllBounds =
    northRaw !== null && southRaw !== null && eastRaw !== null && westRaw !== null;
  const hasFiniteBounds =
    Number.isFinite(parsedNorth) &&
    Number.isFinite(parsedSouth) &&
    Number.isFinite(parsedEast) &&
    Number.isFinite(parsedWest);
  const isDateLineWrap = hasAllBounds && hasFiniteBounds && parsedWest > parsedEast;
  const shouldApplyBounds =
    hasAllBounds &&
    hasFiniteBounds &&
    parsedSouth <= parsedNorth &&
    parsedWest <= parsedEast &&
    parsedSouth >= -90 &&
    parsedNorth <= 90 &&
    parsedWest >= -180 &&
    parsedEast <= 180;

  if (shouldApplyBounds) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        lat: {
          gte: parsedSouth,
          lte: parsedNorth,
        },
      },
      {
        lng: {
          gte: parsedWest,
          lte: parsedEast,
        },
      },
    ];
  }

  const events = await db.event.findMany({
    where,
    orderBy: {
      createdAtISO: "desc",
    },
    take: shouldApplyBounds && !isDateLineWrap ? 500 : 200,
  });

  return NextResponse.json(events);
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingCount = await db.event.count({
      where: { userId },
    });

    if (existingCount >= 10) {
      return NextResponse.json(
        { error: "Event limit reached. You can create up to 10 events." },
        { status: 403 },
      );
    }

    let body: CreateEventBody;

    try {
      body = (await request.json()) as CreateEventBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const autoApprove = typeof body.autoApprove === "boolean" ? body.autoApprove : false;
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const category =
      typeof body.category === "string" ? body.category.trim() : "";
    const customCategoryTitle =
      typeof body.customCategoryTitle === "string"
        ? body.customCategoryTitle.trim()
        : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : undefined;
    const address =
      typeof body.address === "string" ? body.address.trim() : undefined;
    const dateISO = typeof body.dateISO === "string" ? body.dateISO : undefined;
    const contactMethod =
      typeof body.contactMethod === "string" ? body.contactMethod.trim() : "";
    const contactVisibility =
      typeof body.contactVisibility === "string"
        ? body.contactVisibility.trim()
        : "";
    const whatsappInviteUrl =
      typeof body.whatsappInviteUrl === "string"
        ? body.whatsappInviteUrl.trim()
        : "";
    let lat = typeof body.lat === "number" ? body.lat : Number.NaN;
    let lng = typeof body.lng === "number" ? body.lng : Number.NaN;

    if (title.length < 2) {
      return NextResponse.json(
        { error: "Title must be at least 2 characters." },
        { status: 400 },
      );
    }

    if (!isValidCategory(category)) {
      return NextResponse.json(
        { error: "Category is required." },
        { status: 400 },
      );
    }

    if (category === "OTHER" && customCategoryTitle.length < 2) {
      return NextResponse.json(
        { error: "Please enter a title for the Other category." },
        { status: 400 },
      );
    }

    if (!isValidContactMethod(contactMethod)) {
      return NextResponse.json(
        { error: "Contact method is required." },
        { status: 400 },
      );
    }
    if (contactMethod === "NONE") {
      return NextResponse.json(
        { error: "Please choose a contact method so participants can reach out." },
        { status: 400 },
      );
    }

    if (!isValidContactVisibility(contactVisibility)) {
      return NextResponse.json(
        { error: "Contact visibility is required." },
        { status: 400 },
      );
    }

    if (
      contactMethod === "WHATSAPP_GROUP" &&
      !(
        whatsappInviteUrl.startsWith("https://chat.whatsapp.com/") ||
        whatsappInviteUrl.startsWith("https://wa.me/")
      )
    ) {
      return NextResponse.json(
        {
          error:
            "WhatsApp invite URL must start with https://chat.whatsapp.com/ or https://wa.me/",
        },
        { status: 400 },
      );
    }

    let normalizedCity = city ? normalizeCity(city) : null;
    if (city && !normalizedCity) {
      return NextResponse.json(
        { error: "Please choose a city from the list." },
        { status: 400 },
      );
    }

    const hasAddress = Boolean(address && address.length > 0);
    const hasCity = Boolean(normalizedCity);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    if (!hasAddress && !hasCity && !hasCoords) {
      return NextResponse.json(
        { error: "Please provide at least one location input: address, city, or map point." },
        { status: 400 },
      );
    }

    if (!hasCoords) {
      const geocodeQuery = [address, normalizedCity].filter(Boolean).join(", ");
      const geocoded = geocodeQuery ? await geocodeLocation(geocodeQuery) : null;
      if (!geocoded) {
        return NextResponse.json(
          { error: "Could not resolve map coordinates from address/city. Please click on the map." },
          { status: 400 },
        );
      }

      lat = geocoded.lat;
      lng = geocoded.lng;
      if (!normalizedCity && geocoded.city) {
        normalizedCity = geocoded.city;
      }
    }

    if (dateISO) {
      const parsed = new Date(dateISO);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Date must be valid." },
          { status: 400 },
        );
      }
    }

    const event = await db.event.create({
      data: {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Date.now().toString(),
        category,
        customCategoryTitle: category === "OTHER" ? customCategoryTitle : null,
        title,
        city: normalizedCity ?? "",
        autoApprove,
        description: description || null,
        address: address || null,
        dateISO: dateISO || null,
        contactMethod,
        contactVisibility,
        whatsappInviteUrl:
          contactMethod === "WHATSAPP_GROUP" ? whatsappInviteUrl : null,
        lat,
        lng,
        userId,
        createdAtISO: new Date().toISOString(),
      },
    });

    const matchingUsers = normalizedCity
      ? await db.user.findMany({
          where: {
            id: {
              not: userId,
            },
            homeTown: {
              equals: normalizedCity,
              mode: "insensitive",
            },
            interestedCategories: {
              has: category,
            },
          },
          select: {
            id: true,
          },
        })
      : [];

    if (matchingUsers.length > 0) {
      const categoryLabel = getCategoryDisplay(
        category,
        category === "OTHER" ? customCategoryTitle : undefined,
      ).label;

      await Promise.all(
        matchingUsers.map(async (matchingUser) => {
          try {
            await db.notification.create({
              data: {
                userId: matchingUser.id,
                type: "NEW_MATCHING_EVENT",
                eventId: event.id,
                actorId: userId,
                message: event.city
                  ? `A new ${categoryLabel} event was created in ${event.city}`
                  : `A new ${categoryLabel} event was created`,
              },
            });
          } catch (notificationError) {
            console.error("Failed to create matching event notification", {
              userId: matchingUser.id,
              eventId: event.id,
              error:
                notificationError instanceof Error
                  ? notificationError.message
                  : String(notificationError),
            });
          }
        }),
      );
    }

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while creating event."
            : `Server error while creating event: ${message}`,
      },
      { status: 500 },
    );
  }
}
