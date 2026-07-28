import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";
import { lookupExactPhoto } from "../../lib/aviation/providers/planespotters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "aircraft-photo", 30, 60_000);
  if (limited) return limited;
  const hex = (request.nextUrl.searchParams.get("hex") ?? "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  const registration = (request.nextUrl.searchParams.get("registration") ?? "").trim();

  if (hex.length !== 6 && !registration) {
    return NextResponse.json({ photo: null, source: "PlaneSpotters" });
  }

  try {
    const photo = await lookupExactPhoto({ modeS: hex.length === 6 ? hex : null, registration });

    return NextResponse.json(
      {
        photo: photo?.url
          ? { image: photo.url, link: photo.link, photographer: photo.photographer }
          : null,
        source: "PlaneSpotters"
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } }
    );
  } catch {
    return NextResponse.json(
      { photo: null, source: "PlaneSpotters", error: "Photo non disponible." },
      { headers: { "Cache-Control": "public, max-age=120" } }
    );
  }
}
