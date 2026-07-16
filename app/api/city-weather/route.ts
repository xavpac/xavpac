import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type City = { name: string; latitude: number; longitude: number };

const REGIONAL_CITIES: City[] = [
  { name: "Mâcon", latitude: 46.3069, longitude: 4.8287 },
  { name: "Chalon-sur-Saône", latitude: 46.7808, longitude: 4.8532 },
  { name: "Le Creusot", latitude: 46.8062, longitude: 4.4166 },
  { name: "Montceau-les-Mines", latitude: 46.6742, longitude: 4.3623 },
  { name: "Autun", latitude: 46.951, longitude: 4.2987 },
  { name: "Paray-le-Monial", latitude: 46.4546, longitude: 4.1154 },
  { name: "Cluny", latitude: 46.434, longitude: 4.658 },
  { name: "Tournus", latitude: 46.5621, longitude: 4.9104 },
  { name: "Louhans", latitude: 46.6298, longitude: 5.2242 },
  { name: "Bourg-en-Bresse", latitude: 46.2052, longitude: 5.2255 },
  { name: "Dijon", latitude: 47.322, longitude: 5.0415 },
  { name: "Lyon", latitude: 45.764, longitude: 4.8357 }
];

function distanceKm(a: [number, number], b: [number, number]) {
  const [lat1, lon1] = a.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = b.map((value) => (value * Math.PI) / 180);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat") ?? "46.307");
  const longitude = Number(request.nextUrl.searchParams.get("lon") ?? "4.945");
  const count = Math.min(10, Math.max(4, Number(request.nextUrl.searchParams.get("count") ?? "8")));

  const cities = [...REGIONAL_CITIES]
    .sort((a, b) => distanceKm([latitude, longitude], [a.latitude, a.longitude]) - distanceKm([latitude, longitude], [b.latitude, b.longitude]))
    .slice(0, count);

  const latitudes = cities.map((city) => city.latitude).join(",");
  const longitudes = cities.map((city) => city.longitude).join(",");
  const endpoint =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}` +
    `&longitude=${longitudes}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,visibility,cloud_cover` +
    `&wind_speed_unit=kn&timezone=auto`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
      headers: { Accept: "application/json", "User-Agent": "XavPac/6.1" }
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload) ? payload : [payload];
    const weather = cities.map((city, index) => {
      const current = results[index]?.current ?? {};
      const code = Number(current.weather_code ?? 1);
      return {
        ...city,
        distance: distanceKm([latitude, longitude], [city.latitude, city.longitude]),
        temperature: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
        windSpeed: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
        windDirection: typeof current.wind_direction_10m === "number" ? current.wind_direction_10m : null,
        visibility: typeof current.visibility === "number" ? current.visibility : null,
        cloudCover: typeof current.cloud_cover === "number" ? current.cloud_cover : null,
        weatherCode: code,
        ...weatherLabel(code)
      };
    });

    return NextResponse.json(
      { source: "Open-Meteo", fetchedAt: new Date().toISOString(), weather },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { source: "Open-Meteo", error: "Météo des villes indisponible.", weather: [] },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
