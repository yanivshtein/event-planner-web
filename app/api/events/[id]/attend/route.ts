import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  return NextResponse.json(
    { error: "Instant attend is disabled. Use join requests." },
    { status: 410 },
  );
}
