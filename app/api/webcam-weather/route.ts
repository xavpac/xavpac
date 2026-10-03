import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function weatherLabel(code: number) {
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Peu nuageux";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67].includes(code)) return "Pluie";
  if ([71, 73, 75, 77].includes(code)) return "Neige";
  if ([80, 81, 82].includes(code)) return "Averses";
  if ([85, 86].includes(code)) return "Averses de neige";
  if ([95, 96, 99].includes(code)) return "Orage";
  return "Conditions variables";
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Coordonnées invalides." }, { status: 400 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m");
  url.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}`
      }
    });

    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

    const payload = await response.json();
    const current = payload?.current;

    if (!current) {
      throw new Error("Open-Meteo: current absent");
    }

    return NextResponse.json({
      source: "Open-Meteo",
      fetchedAt: new Date().toISOString(),
      timezone: payload.timezone ?? null,
      current: {
        time: current.time ?? null,
        temperature: current.temperature_2m ?? null,
        apparentTemperature: current.apparent_temperature ?? null,
        windSpeed: current.wind_speed_10m ?? null,
        windDirection: current.wind_direction_10m ?? null,
        weatherCode: current.weather_code ?? null,
        label: weatherLabel(Number(current.weather_code))
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer la météo actuelle.", source: "Open-Meteo" },
      { status: 502 }
    );
  }
}
