import { NextResponse } from "next/server";
import { getAuthSession } from "@/src/lib/auth";
import { findCityInText, normalizeCity } from "@/src/lib/cities";
import {
  isValidContactMethod,
  isValidContactVisibility,
} from "@/src/lib/contactMethods";
import { isValidCategory } from "@/src/lib/eventCategories";
import { db } from "@/src/lib/db";

type UpdateEventBody = {
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

function getSessionUser(
  session: Awaited<ReturnType<typeof getAuthSession>>,
) {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(event);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await db.event.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: UpdateEventBody;

    try {
      body = (await request.json()) as UpdateEventBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const autoApprove =
      typeof body.autoApprove === "boolean" ? body.autoApprove : undefined;
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

    let normalizedCity = city ? normalizeCity(city) : null;
    if (city && !normalizedCity) {
      return NextResponse.json(
        { error: "Please choose a city from the list." },
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

    const event = await db.event.update({
      where: { id },
      data: {
        category,
        customCategoryTitle: category === "OTHER" ? customCategoryTitle : null,
        title,
        city: normalizedCity ?? "",
        description: description || null,
        address: address || null,
        dateISO: dateISO || null,
        contactMethod,
        contactVisibility,
        whatsappInviteUrl:
          contactMethod === "WHATSAPP_GROUP" ? whatsappInviteUrl : null,
        lat,
        lng,
        ...(typeof autoApprove === "boolean" ? { autoApprove } : {}),
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while updating event."
            : `Server error while updating event: ${message}`,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const event = await db.event.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (event.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.event.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while deleting event."
            : `Server error while deleting event: ${message}`,
      },
      { status: 500 },
    );
  }
}
