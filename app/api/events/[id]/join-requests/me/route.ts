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

    const { id: eventId } = await context.params;
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true, userId: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const joinRequest = await db.joinRequest.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: { id: true, status: true },
    });

    if (joinRequest?.status === "PENDING") {
      await db.joinRequest.delete({
        where: { id: joinRequest.id },
      });

      const requester = await db.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const requesterName = requester?.name?.trim() || "Someone";

      if (event.userId && event.userId !== userId) {
        await db.notification.create({
          data: {
            userId: event.userId,
            type: "JOIN_CANCELLED",
            actorId: userId,
            eventId,
            message: `${requesterName} cancelled their join request`,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while cancelling join request."
            : `Server error while cancelling join request: ${message}`,
      },
      { status: 500 },
    );
  }
}
