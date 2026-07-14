import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "XavPac/3.0"
    }
  });

  if (response.status === 204) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`AviationWeather ${response.status}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  const rawIds = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = rawIds
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]{4}$/.test(value))
    .slice(0, 6);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Au moins un code ICAO valide est requis." },
      { status: 400 }
    );
  }

  const joined = ids.join(",");

  try {
    const [metar, taf] = await Promise.all([
      fetchJson(
        `https://aviationweather.gov/api/data/metar?ids=${joined}&format=json`
      ),
      fetchJson(
        `https://aviationweather.gov/api/data/taf?ids=${joined}&format=json`
      )
    ]);

    return NextResponse.json({
      source: "Aviation Weather Center",
      fetchedAt: new Date().toISOString(),
      metar,
      taf
    });
  } catch {
    return NextResponse.json(
      {
        error: "Impossible de récupérer les METAR/TAF.",
        source: "Aviation Weather Center",
        metar: [],
        taf: []
      },
      { status: 502 }
    );
  }
}
