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
      select: { id: true, title: true, userId: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const alreadyAttendance = await db.attendance.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true },
    });
    if (alreadyAttendance) {
      return NextResponse.json(
        { error: "Already attending." },
        { status: 409 },
      );
    }

    const existing = await db.joinRequest.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "APPROVED") {
      return NextResponse.json(
        { error: "Already attending." },
        { status: 409 },
      );
    }

    if (existing?.status === "PENDING") {
      return NextResponse.json(
        { status: "PENDING", message: "Already requested." },
        { status: 200 },
      );
    }

    if (existing?.status === "REJECTED") {
      await db.joinRequest.update({
        where: { id: existing.id },
        data: { status: "PENDING" },
      });
    } else if (!existing) {
      await db.joinRequest.create({
        data: {
          eventId,
          userId,
          status: "PENDING",
        },
      });
    }

    const requester = await db.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const requesterName = requester?.name?.trim() || "Someone";

    if (event.userId && event.userId !== userId) {
      await db.notification.create({
        data: {
          userId: event.userId,
          type: "JOIN_REQUESTED",
          actorId: userId,
          eventId,
          message: `${requesterName} requested to join your event`,
        },
      });
    }

    return NextResponse.json({ status: "PENDING" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while creating join request."
            : `Server error while creating join request: ${message}`,
      },
      { status: 500 },
    );
  }
}

export async function GET(
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
    if (event.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requests = await db.joinRequest.findMany({
      where: { eventId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
    requests.sort((a, b) => {
      const left = order[a.status as keyof typeof order] ?? 99;
      const right = order[b.status as keyof typeof order] ?? 99;
      if (left !== right) {
        return left - right;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return NextResponse.json(requests);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Server error while loading join requests."
            : `Server error while loading join requests: ${message}`,
      },
      { status: 500 },
    );
  }
}
