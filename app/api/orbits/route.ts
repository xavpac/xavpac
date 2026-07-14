import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedGroups = new Set(["stations", "starlink", "visual"]);

export async function GET(request: NextRequest) {
  const group = request.nextUrl.searchParams.get("group") ?? "stations";

  if (!allowedGroups.has(group)) {
    return NextResponse.json(
      { error: "Groupe orbital non autorisé." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "XavPac/3.0"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`CelesTrak ${response.status}`);
    }

    const data = await response.json();
    const records = Array.isArray(data) ? data : [];

    return NextResponse.json({
      source: "CelesTrak",
      group,
      fetchedAt: new Date().toISOString(),
      count: records.length,
      records: records.slice(0, group === "starlink" ? 250 : 100)
    });
  } catch {
    return NextResponse.json(
      {
        error: "Impossible de récupérer les éléments orbitaux.",
        source: "CelesTrak",
        group,
        count: 0,
        records: []
      },
      { status: 502 }
    );
  }
}
