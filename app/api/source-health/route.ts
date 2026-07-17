import { NextResponse } from "next/server";
import { cacheStats } from "../../lib/aviation/cache";
import { sourceHealth } from "../../lib/aviation/sourceAdapter";
import "../../lib/aviation/providers/adsbdb";
import "../../lib/aviation/providers/opensky";
import "../../lib/aviation/providers/planespotters";
import "../../lib/aviation/providers/airplanesLive";
import "../../lib/aviation/providers/celestrak";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = sourceHealth();
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    cache: cacheStats(),
    sources
  }, { headers: { "Cache-Control": "no-store" } });
}
