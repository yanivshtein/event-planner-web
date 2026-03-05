import { NextResponse } from "next/server";
import { getAuthSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";

type MarkReadBody = {
  ids?: unknown;
  all?: unknown;
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

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: MarkReadBody;
    try {
      body = (await request.json()) as MarkReadBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.all === true) {
      await db.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: { isRead: true },
      });

      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((item): item is string => typeof item === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Provide ids or all=true." },
        { status: 400 },
      );
    }

    await db.notification.updateMany({
      where: {
        userId,
        id: { in: ids },
      },
      data: {
        isRead: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while marking notifications."
            : `Server error while marking notifications: ${message}`,
      },
      { status: 500 },
    );
  }
}
