import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { AIRLINES } from "../../../data/airlines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SwiftUI/tvOS ne sait pas afficher nos logos SVG depuis AsyncImage.
// Cette route réalise une vraie conversion SVG -> PNG sans modifier la marque.
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file") ?? "";
  const allowed = AIRLINES.map((a) => a.logoPath.split("/").pop()).includes(file);
  if (!allowed || !/^[a-z0-9-]{2,60}\.svg$/.test(file)) {
    return NextResponse.json({ error: "Logo inconnu" }, { status: 404 });
  }
  try {
    const logoResponse = await fetch(new URL("/airlines/" + file, request.url), {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(7000)
    });
    if (!logoResponse.ok) throw new Error("Logo SVG indisponible");
    const svg = await logoResponse.text();
    if (!svg.includes("<svg") || svg.length > 120000) throw new Error("Source SVG invalide");
    const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
    const image = createElement("div", {
      style: { display: "flex", height: "100%", width: "100%", alignItems: "center",
        justifyContent: "center", backgroundColor: "#ffffff", padding: "6px" }
    }, createElement("img", {
      src, width: 300, height: 106, style: { objectFit: "contain" }
    }));
    return new ImageResponse(image, {
      width: 320, height: 120,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
    });
  } catch {
    return NextResponse.json({ error: "Conversion de logo momentanément indisponible" }, { status: 503 });
  }
}
