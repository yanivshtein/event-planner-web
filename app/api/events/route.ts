import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthSession } from "@/src/lib/auth";
import {
  isValidContactMethod,
  isValidContactVisibility,
} from "@/src/lib/contactMethods";
import { isValidCategory } from "@/src/lib/eventCategories";
import { db } from "@/src/lib/db";

export const dynamic = "force-dynamic";

type CreateEventBody = {
  category?: unknown;
  customCategoryTitle?: unknown;
  title?: unknown;
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
    const lat = typeof body.lat === "number" ? body.lat : Number.NaN;
    const lng = typeof body.lng === "number" ? body.lng : Number.NaN;

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

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "Latitude and longitude are required." },
        { status: 400 },
      );
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
