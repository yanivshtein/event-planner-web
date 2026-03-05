import { NextResponse } from "next/server";
import { getAuthSession } from "@/src/lib/auth";
import { db } from "@/src/lib/db";

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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const session = await getAuthSession();
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: eventId, requestId } = await context.params;
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, userId: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (event.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const joinRequest = await db.joinRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, eventId: true },
    });
    if (!joinRequest || joinRequest.eventId !== eventId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.joinRequest.update({
      where: { id: joinRequest.id },
      data: { status: "REJECTED" },
    });

    await db.attendance.deleteMany({
      where: {
        eventId,
        userId: joinRequest.userId,
      },
    });

    await db.notification.create({
      data: {
        userId: joinRequest.userId,
        actorId: userId,
        eventId,
        type: "JOIN_REJECTED",
        message: `Your request to join ${event.title} was rejected`,
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
            ? "Server error while rejecting request."
            : `Server error while rejecting request: ${message}`,
      },
      { status: 500 },
    );
  }
}
