import { NextResponse } from "next/server";
import { getAuthSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";

type MeBody = {
  phone?: unknown;
};

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

function isValidPhone(value: string) {
  return /^\+?[0-9]{7,20}$/.test(value);
}

export async function GET() {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    return NextResponse.json({
      phone: user?.phone ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while loading profile."
            : `Server error while loading profile: ${message}`,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: MeBody;
    try {
      body = (await request.json()) as MeBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (rawPhone && !isValidPhone(rawPhone)) {
      return NextResponse.json(
        { error: "Phone must contain only + and digits, length 7-20." },
        { status: 400 },
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data: {
        phone: rawPhone || null,
      },
      select: {
        phone: true,
      },
    });

    return NextResponse.json({
      phone: user.phone ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while updating profile."
            : `Server error while updating profile: ${message}`,
      },
      { status: 500 },
    );
  }
}
