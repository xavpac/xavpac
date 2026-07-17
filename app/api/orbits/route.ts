import { NextRequest, NextResponse } from "next/server";
import { fetchCelesTrak } from "../../lib/aviation/providers/celestrak";

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
    const records = await fetchCelesTrak(group as "stations" | "starlink" | "visual");

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
