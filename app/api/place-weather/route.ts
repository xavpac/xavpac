import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function weatherLabel(code: number) {
  if (code === 0) return { icon: "☀️", label: "Ciel clair" };
  if ([1, 2].includes(code)) return { icon: "🌤️", label: "Peu nuageux" };
  if (code === 3) return { icon: "☁️", label: "Couvert" };
  if ([45, 48].includes(code)) return { icon: "🌫️", label: "Brouillard" };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: "🌦️", label: "Bruine" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "🌧️", label: "Pluie" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "🌨️", label: "Neige" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", label: "Orage" };
  return { icon: "🌤️", label: "Variable" };
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim().slice(0, 80);

  if (city.length < 2) {
    return NextResponse.json({ error: "Indiquez une ville valide." }, { status: 400 });
  }

  try {
    const geocodingUrl =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}` +
      `&count=1&language=fr&format=json`;

    const geocodingResponse = await fetch(geocodingUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", "User-Agent": "XavPac/8.0" }
    });

    if (!geocodingResponse.ok) throw new Error("Géocodage indisponible");

    const geocoding = await geocodingResponse.json();
    const place = Array.isArray(geocoding.results) ? geocoding.results[0] : null;

    if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return NextResponse.json({ error: "Ville introuvable." }, { status: 404 });
    }

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,visibility` +
      `&wind_speed_unit=kn&timezone=auto`;

    const forecastResponse = await fetch(forecastUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", "User-Agent": "XavPac/8.0" }
    });

    if (!forecastResponse.ok) throw new Error("Prévisions indisponibles");

    const forecast = await forecastResponse.json();
    const current = forecast.current ?? {};
    const code = Number(current.weather_code ?? 1);

    return NextResponse.json(
      {
        source: "Open-Meteo",
        fetchedAt: new Date().toISOString(),
        weather: {
          name: place.name ?? city,
          country: place.country ?? "",
          latitude: place.latitude,
          longitude: place.longitude,
          temperature: finiteOrNull(current.temperature_2m),
          apparentTemperature: finiteOrNull(current.apparent_temperature),
          windSpeed: finiteOrNull(current.wind_speed_10m),
          windDirection: finiteOrNull(current.wind_direction_10m),
          visibility: finiteOrNull(current.visibility),
          weatherCode: code,
          ...weatherLabel(code)
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer la météo de cette ville." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
