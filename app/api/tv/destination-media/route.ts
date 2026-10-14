import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../../lib/api/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DestinationMediaItem = {
  id: string;
  type: "video" | "image";
  url: string;
  preview: string | null;
  author: string | null;
  sourceName: string;
  sourceUrl: string | null;
};

type PexelsVideoFile = {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
};

type PexelsVideo = {
  id: number;
  width?: number;
  height?: number;
  url?: string;
  image?: string;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
};

type PexelsPhoto = {
  id: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  src?: {
    original?: string;
    large2x?: string;
    large?: string;
    landscape?: string;
  };
};

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: {
    Artist?: { value?: string };
    Credit?: { value?: string };
  };
};

type CommonsPage = {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
};

function cleanText(value: string | null, maxLength = 90) {
  return (value ?? "")
    .replace(/[\u0000-\u001F<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function clampInteger(value: string | null, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function stripHtml(value?: string) {
  if (!value) return null;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function pickPexelsVideoFile(files?: PexelsVideoFile[]) {
  const candidates = (files ?? [])
    .filter((file) =>
      typeof file.link === "string"
      && file.link.startsWith("https://")
      && (file.file_type ?? "").toLowerCase().includes("mp4")
      && (file.width ?? 0) >= (file.height ?? 0)
    )
    .sort((left, right) => {
      const leftWidth = left.width ?? 0;
      const rightWidth = right.width ?? 0;
      const leftPreferred = leftWidth >= 960 && leftWidth <= 1920 ? 1 : 0;
      const rightPreferred = rightWidth >= 960 && rightWidth <= 1920 ? 1 : 0;
      return rightPreferred - leftPreferred || rightWidth - leftWidth;
    });

  return candidates[0]?.link ?? null;
}

function mergeMedia(videos: DestinationMediaItem[], images: DestinationMediaItem[]) {
  const merged: DestinationMediaItem[] = [];
  const maxLength = Math.max(videos.length, images.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (videos[index]) merged.push(videos[index]);
    if (videos[index + 1]) merged.push(videos[index + 1]);
    if (images[index]) merged.push(images[index]);
  }

  const unique = new Map<string, DestinationMediaItem>();
  for (const item of merged) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()].slice(0, 70);
}

async function fetchPexels(city: string, iata: string, page: number) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return null;

  const query = [city, iata, "city skyline travel landmark"].filter(Boolean).join(" ");
  const headers = { Authorization: key, Accept: "application/json" };

  const videoUrl = new URL("https://api.pexels.com/v1/videos/search");
  videoUrl.searchParams.set("query", query);
  videoUrl.searchParams.set("orientation", "landscape");
  videoUrl.searchParams.set("size", "medium");
  videoUrl.searchParams.set("per_page", "40");
  videoUrl.searchParams.set("page", String(page));

  const photoUrl = new URL("https://api.pexels.com/v1/search");
  photoUrl.searchParams.set("query", query);
  photoUrl.searchParams.set("orientation", "landscape");
  photoUrl.searchParams.set("size", "large");
  photoUrl.searchParams.set("per_page", "40");
  photoUrl.searchParams.set("page", String(page));

  const [videoResponse, photoResponse] = await Promise.all([
    fetch(videoUrl, {
      headers,
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8500)
    }),
    fetch(photoUrl, {
      headers,
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8500)
    })
  ]);

  if (!videoResponse.ok && !photoResponse.ok) return null;

  const videoPayload = videoResponse.ok
    ? await videoResponse.json() as { videos?: PexelsVideo[] }
    : { videos: [] };
  const photoPayload = photoResponse.ok
    ? await photoResponse.json() as { photos?: PexelsPhoto[] }
    : { photos: [] };

  const videos = (videoPayload.videos ?? []).flatMap<DestinationMediaItem>((video) => {
    const url = pickPexelsVideoFile(video.video_files);
    if (!url) return [];
    return [{
      id: `pexels-video-${video.id}`,
      type: "video",
      url,
      preview: video.image?.startsWith("https://") ? video.image : null,
      author: video.user?.name?.trim() || null,
      sourceName: "Pexels",
      sourceUrl: video.url?.startsWith("https://") ? video.url : "https://www.pexels.com/"
    }];
  });

  const images = (photoPayload.photos ?? []).flatMap<DestinationMediaItem>((photo) => {
    const url = photo.src?.landscape
      || photo.src?.large2x
      || photo.src?.large
      || photo.src?.original;
    if (!url?.startsWith("https://")) return [];
    return [{
      id: `pexels-photo-${photo.id}`,
      type: "image",
      url,
      preview: photo.src?.large ?? null,
      author: photo.photographer?.trim() || null,
      sourceName: "Pexels",
      sourceUrl: photo.url?.startsWith("https://") ? photo.url : "https://www.pexels.com/"
    }];
  });

  const items = mergeMedia(videos, images);
  return items.length ? { provider: "Pexels", items } : null;
}

async function fetchCommons(city: string, iata: string, page: number) {
  const query = [city, iata, "skyline landmark city"].filter(Boolean).join(" ");
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "50");
  url.searchParams.set("gsroffset", String((page - 1) * 20));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, {
    next: { revalidate: 21_600 },
    signal: AbortSignal.timeout(8500),
    headers: {
      Accept: "application/json",
      "User-Agent": "XavPacTV/2.0 (https://github.com/xavpac/xavpac)"
    }
  });

  if (!response.ok) return { provider: "Wikimedia Commons", items: [] as DestinationMediaItem[] };

  const payload = await response.json() as {
    query?: { pages?: Record<string, CommonsPage> };
  };

  const items = Object.values(payload.query?.pages ?? {})
    .flatMap<DestinationMediaItem>((pageItem) => {
      const info = pageItem.imageinfo?.[0];
      const mime = info?.mime?.toLowerCase() ?? "";
      if (!mime.startsWith("image/")) return [];
      const mediaUrl = info?.thumburl || info?.url;
      if (!mediaUrl?.startsWith("https://")) return [];
      return [{
        id: `commons-${pageItem.pageid ?? hashString(mediaUrl)}`,
        type: "image",
        url: mediaUrl,
        preview: info?.thumburl ?? null,
        author: stripHtml(info?.extmetadata?.Artist?.value)
          || stripHtml(info?.extmetadata?.Credit?.value),
        sourceName: "Wikimedia Commons",
        sourceUrl: info?.descriptionurl?.startsWith("https://")
          ? info.descriptionurl
          : "https://commons.wikimedia.org/"
      }];
    })
    .slice(0, 45);

  return { provider: "Wikimedia Commons", items };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "tv-destination-media", 60, 60_000);
  if (limited) return limited;

  const city = cleanText(request.nextUrl.searchParams.get("city"), 80);
  const iata = cleanText(request.nextUrl.searchParams.get("iata"), 8).toUpperCase();
  const cycle = clampInteger(request.nextUrl.searchParams.get("cycle"), 0, 99);

  if (city.length < 2) {
    return NextResponse.json(
      { ok: false, provider: "none", city, country: null, items: [], error: "Ville requise." },
      { status: 400 }
    );
  }

  const sixHourWindow = Math.floor(Date.now() / 21_600_000);
  const page = ((hashString(city.toLowerCase()) + sixHourWindow + cycle) % 10) + 1;

  try {
    const pexels = await fetchPexels(city, iata, page);
    const result = pexels ?? await fetchCommons(city, iata, page);

    return NextResponse.json(
      {
        ok: result.items.length > 0,
        provider: result.provider,
        city,
        country: null,
        page,
        items: result.items
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=21600"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        provider: "none",
        city,
        country: null,
        items: [],
        error: "Médias de destination momentanément indisponibles."
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
