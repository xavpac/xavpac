import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlaneSpottersPhoto = {
  thumbnail?: { src?: string };
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
};

type PlaneSpottersPayload = { photos?: PlaneSpottersPhoto[] };

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "aircraft-photo", 30, 60_000);
  if (limited) return limited;
  const hex = (request.nextUrl.searchParams.get("hex") ?? "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  const registration = (request.nextUrl.searchParams.get("registration") ?? "").trim();

  const lookup = hex.length === 6
    ? `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`
    : registration
      ? `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`
      : null;

  if (!lookup) {
    return NextResponse.json({ photo: null, source: "PlaneSpotters" });
  }

  try {
    const response = await fetch(lookup, {
      cache: "no-store",
      signal: AbortSignal.timeout(6500),
      headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` }
    });

    if (!response.ok) {
      throw new Error(`PlaneSpotters ${response.status}`);
    }

    const payload = (await response.json()) as PlaneSpottersPayload;
    const first = Array.isArray(payload.photos) ? payload.photos[0] : undefined;
    const rawImage = first?.thumbnail_large?.src ?? first?.thumbnail?.src ?? null;
    const image = rawImage?.startsWith("//") ? `https:${rawImage}` : rawImage;

    return NextResponse.json(
      {
        photo: image
          ? { image, link: first?.link ?? null, photographer: first?.photographer ?? null }
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
