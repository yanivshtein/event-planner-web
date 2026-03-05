import { NextResponse } from "next/server";
import { getAuthSession } from "@/src/lib/auth";
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

    const event = await db.event.update({
      where: { id },
      data: {
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
