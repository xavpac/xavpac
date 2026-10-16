import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
};
type CommonsPage = { title?: string; imageinfo?: CommonsImageInfo[] };

// Images documentées sur Wikimedia Commons, situées à Bâgé-Dommartin
// (Bâgé-la-Ville est une commune déléguée). Aucune photo générique d'un autre lieu.
const localPhotos = [
  { file: "Mairie Bâgé Ville Bâgé Dommartin 3.jpg", caption: "La mairie de Bâgé-la-Ville" },
  { file: "Église St Michel Bâgé Ville Bâgé Dommartin 1.jpg", caption: "L'église Saint-Michel" },
  { file: "Place centrale Bâgé-la-Ville.JPG", caption: "La place du village" },
  { file: "Église St Michel Bâgé Ville Bâgé Dommartin 3.jpg", caption: "Le patrimoine local" },
  { file: "Église Saint Michel - Bâgé-Dommartin (FR01) - 2024-07-08 - 1.jpg", caption: "Saint-Michel de Bâgé-Dommartin" },
  { file: "Clocher blv hiver.jpg", caption: "Le clocher en hiver" }
] as const;

function stripMarkup(value?: string) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 110);
}

async function getLocalPhotos() {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
    titles: localPhotos.map((entry) => "File:" + entry.file).join("|")
  });
  try {
    const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(11_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "XavPacTV/4.0 (https://github.com/xavpac/xavpac)"
      }
    });
    if (!response.ok) return [];
    const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
    const photos = Object.values(payload.query?.pages ?? {}).flatMap((page) => {
      const info = page.imageinfo?.[0];
      const fullTitle = page.title?.replace(/^File:/, "") ?? "";
      const local = localPhotos.find((entry) => entry.file === fullTitle);
      if (!local || !info) return [];
      const url = info.thumburl ?? info.url;
      if (!url?.startsWith("https://")) return [];
      return [{
        id: fullTitle,
        url,
        caption: local.caption,
        author: stripMarkup(info.extmetadata?.Artist?.value) || "Wikimedia Commons",
        license: stripMarkup(info.extmetadata?.LicenseShortName?.value) || "Wikimedia Commons",
        source: info.descriptionurl ?? "https://commons.wikimedia.org/"
      }];
    });
    return localPhotos.flatMap(({ file }) => photos.filter((photo) => photo.id === file));
  } catch {
    return [];
  }
}

async function getLocalWeather() {
  const params = new URLSearchParams({
    latitude: "46.345497",
    longitude: "4.976824",
    timezone: "Europe/Paris",
    wind_speed_unit: "kmh",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "1"
  });
  try {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(11_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      current?: {
        time?: string; temperature_2m?: number; apparent_temperature?: number;
        relative_humidity_2m?: number; weather_code?: number; is_day?: number;
        wind_speed_10m?: number; wind_direction_10m?: number;
        wind_gusts_10m?: number; pressure_msl?: number; cloud_cover?: number;
      };
      daily?: {
        temperature_2m_max?: number[]; temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    if (typeof payload.current?.temperature_2m !== "number") return null;
    return {
      observedAt: payload.current.time ?? null,
      temperature: payload.current.temperature_2m,
      feelsLike: payload.current.apparent_temperature ?? null,
      humidity: payload.current.relative_humidity_2m ?? null,
      weatherCode: payload.current.weather_code ?? null,
      isDay: payload.current.is_day === 1,
      windSpeed: payload.current.wind_speed_10m ?? null,
      windDirection: payload.current.wind_direction_10m ?? null,
      windGusts: payload.current.wind_gusts_10m ?? null,
      pressure: payload.current.pressure_msl ?? null,
      cloudCover: payload.current.cloud_cover ?? null,
      high: payload.daily?.temperature_2m_max?.[0] ?? null,
      low: payload.daily?.temperature_2m_min?.[0] ?? null,
      rainChance: payload.daily?.precipitation_probability_max?.[0] ?? null
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [weather, photos] = await Promise.all([getLocalWeather(), getLocalPhotos()]);
  return NextResponse.json({
    location: "Bâgé-Dommartin",
    coordinates: { latitude: 46.345497, longitude: 4.976824 },
    weather,
    photos,
    weatherSource: "Open-Meteo",
    photoSource: "Wikimedia Commons",
    fetchedAt: new Date().toISOString()
  }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
