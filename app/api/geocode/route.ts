import { NextResponse } from "next/server";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const nominatimUrl =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);

  try {
    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "event-planner-app",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }

    const data = (await response.json()) as NominatimResult[];

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const first = data[0];
    const lat = Number(first.lat);
    const lng = Number(first.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }

    return NextResponse.json({
      lat,
      lng,
      displayName: first.display_name,
    });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}
