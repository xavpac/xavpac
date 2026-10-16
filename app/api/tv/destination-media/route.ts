import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../../lib/api/guard";
import { composeTvSequence, type TVScene } from "../../../lib/tv/cinematicSequence";

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
  appleVideoUrl?: string | null;
  scene?: TVScene;
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


type PixabayVideoVariant = {
  url?: string;
  width?: number;
  height?: number;
};

type PixabayVideo = {
  id: number;
  pageURL?: string;
  user?: string;
  videos?: {
    large?: PixabayVideoVariant;
    medium?: PixabayVideoVariant;
    small?: PixabayVideoVariant;
    tiny?: PixabayVideoVariant;
  };
};

type PixabayImage = {
  id: number;
  pageURL?: string;
  user?: string;
  largeImageURL?: string;
  webformatURL?: string;
};


type CommonsVideoDerivative = {
  src?: string;
  type?: string;
  width?: number;
  height?: number;
  transcodekey?: string;
};

type CommonsVideoInfo = {
  url?: string;
  thumburl?: string;
  mime?: string;
  descriptionurl?: string;
  derivatives?: CommonsVideoDerivative[];
  extmetadata?: {
    Artist?: { value?: string };
    Credit?: { value?: string };
  };
};

type CommonsVideoPage = {
  pageid?: number;
  title?: string;
  videoinfo?: CommonsVideoInfo[];
};

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  mime?: string;
  width?: number;
  height?: number;
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


function mediaTheme(cycle: number) {
  const themes = [
    "aerial drone city skyline",
    "airport runway terminal aviation",
    "cockpit approach landing airport",
    "city river skyline landmark",
    "aerial night city lights",
    "airport aerial view runway"
  ];
  return themes[cycle % themes.length];
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

async function fetchPexels(city: string, _iata: string, page: number, _theme: string) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return null;

  const query = city;
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
      scene: "city",
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
      scene: "ambience",
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


function pickPixabayVideo(video: PixabayVideo) {
  const candidates = [
    video.videos?.medium,
    video.videos?.large,
    video.videos?.small,
    video.videos?.tiny
  ].filter((item): item is PixabayVideoVariant => Boolean(
    item?.url?.startsWith("https://")
    && (item.width ?? 0) >= (item.height ?? 0)
  ));

  return candidates[0]?.url ?? null;
}

async function fetchPixabay(city: string, _iata: string, page: number, _theme: string) {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return null;

  const query = city;

  const videoUrl = new URL("https://pixabay.com/api/videos/");
  videoUrl.searchParams.set("key", key);
  videoUrl.searchParams.set("q", query);
  videoUrl.searchParams.set("category", "travel");
  videoUrl.searchParams.set("per_page", "30");
  videoUrl.searchParams.set("page", String(page));
  videoUrl.searchParams.set("safesearch", "true");

  const imageUrl = new URL("https://pixabay.com/api/");
  imageUrl.searchParams.set("key", key);
  imageUrl.searchParams.set("q", query);
  imageUrl.searchParams.set("category", "travel");
  imageUrl.searchParams.set("orientation", "horizontal");
  imageUrl.searchParams.set("image_type", "photo");
  imageUrl.searchParams.set("per_page", "30");
  imageUrl.searchParams.set("page", String(page));
  imageUrl.searchParams.set("safesearch", "true");

  const [videoResponse, imageResponse] = await Promise.all([
    fetch(videoUrl, {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8500),
      headers: { Accept: "application/json", "User-Agent": "XavPacTV/2.0" }
    }),
    fetch(imageUrl, {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8500),
      headers: { Accept: "application/json", "User-Agent": "XavPacTV/2.0" }
    })
  ]);

  if (!videoResponse.ok && !imageResponse.ok) return null;

  const videoPayload = videoResponse.ok
    ? await videoResponse.json() as { hits?: PixabayVideo[] }
    : { hits: [] };
  const imagePayload = imageResponse.ok
    ? await imageResponse.json() as { hits?: PixabayImage[] }
    : { hits: [] };

  const videos = (videoPayload.hits ?? []).flatMap<DestinationMediaItem>((video) => {
    const url = pickPixabayVideo(video);
    if (!url) return [];
    return [{
      id: `pixabay-video-${video.id}`,
      type: "video",
      scene: "city",
      url,
      preview: null,
      author: video.user?.trim() || null,
      sourceName: "Pixabay",
      sourceUrl: video.pageURL?.startsWith("https://") ? video.pageURL : "https://pixabay.com/"
    }];
  });

  const images = (imagePayload.hits ?? []).flatMap<DestinationMediaItem>((image) => {
    const url = image.largeImageURL || image.webformatURL;
    if (!url?.startsWith("https://")) return [];
    return [{
      id: `pixabay-photo-${image.id}`,
      type: "image",
      scene: "ambience",
      url,
      preview: image.webformatURL?.startsWith("https://") ? image.webformatURL : null,
      author: image.user?.trim() || null,
      sourceName: "Pixabay",
      sourceUrl: image.pageURL?.startsWith("https://") ? image.pageURL : "https://pixabay.com/"
    }];
  });

  const items = mergeMedia(videos, images);
  return items.length ? { provider: "Pixabay", items } : null;
}


function pickCommonsVideoDerivative(derivatives?: CommonsVideoDerivative[]) {
  // Commons proposes generally WebM and QuickTime transcodes rather than MP4.
  // Keep the best widely-playable derivative; the client skips broken videos.
  const candidates = (derivatives ?? [])
    .filter((item) => {
      const src = item.src ?? "";
      const type = (item.type ?? "").toLowerCase();
      const isVideo = type.includes("video/mp4") || type.includes("video/webm")
        || type.includes("video/quicktime") || /\\.(mp4|webm|mov)(?:[?#]|$)/i.test(src);
      return src.startsWith("https://")
        && isVideo
        && (item.width ?? 0) >= (item.height ?? 0)
        && (item.width ?? 0) >= 360;
    })
    .sort((left, right) => {
      const score = (item: CommonsVideoDerivative) => {
        const src = (item.src ?? "").toLowerCase();
        const type = (item.type ?? "").toLowerCase();
        const format = type.includes("video/mp4") || /\\.mp4(?:[?#]|$)/.test(src)
          ? 300 : type.includes("video/webm") ? 200 : 100;
        const width = item.width ?? 0;
        const resolution = width >= 960 && width <= 1920 ? 65 : width >= 640 ? 50 : 15;
        return format + resolution;
      };
      return score(right) - score(left) || (right.width ?? 0) - (left.width ?? 0);
    });
  return candidates[0] ?? null;
}


function normalized(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").toLowerCase();
}

function scenicScore(title: string, scene: TVScene) {
  const text = normalized(title);
  let score = 0;
  if (/hyperlapse|timelapse|time lapse|sunset|night light|cityscape|skyline|panorama|landscape|drone|aerial|overflight|bird.?s.eye|monument|landmark/.test(text)) score += 12;
  if (/airport|aeroport|aerodrome|terminal|runway|airfield|landing|approach|takeoff|take.off|control tower|piste/.test(text)) {
    score += scene === "airport" || scene === "approach" ? 15 : -4;
  }
  if (/tram|train|berthing|container|cargo ship|msc |interview|news report|march|protest|conference|football|soccer|poster|logo|coat of arms|map of|battle|world war/.test(text)) score -= 24;
  if (scene === "approach" && /landing|approach|takeoff|aircraft|plane|aeroplane|flight/.test(text)) score += 10;
  if (/\.webm$/.test(text)) score += 1;
  return score;
}

type CommonsMode = "image" | "video";
const commonsAgent = "XavPacTV/5.0 (https://github.com/xavpac/xavpac)";

async function fetchCommonsScene(
  city: string, airport: string, iata: string,
  scene: TVScene, mode: CommonsMode
): Promise<DestinationMediaItem[]> {
  const querySets: string[] = (() => {
    if (mode === "video" && scene === "city") return [
      city + " timelapse filetype:video", city + " aerial filetype:video", city + " filetype:video"
    ];
    if (mode === "video") return [
      city + " airport landing filetype:video",
      (airport || city + " airport") + " filetype:video"
    ];
    if (scene === "airport") return [
      (airport || city + " airport") + " runway terminal", city + " airport"
    ];
    if (scene === "ambience") return [
      city + " monument landmark", city + " panorama"
    ];
    return [city + " skyline panorama", city + " city panorama", city];
  })();

  const unique = new Map<string, DestinationMediaItem>();
  for (const query of querySets) {
    if (unique.size >= (mode === "video" ? 4 : 8)) break;
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", mode === "video" ? "28" : "35");
    url.searchParams.set("gsroffset", "0");
    url.searchParams.set("prop", mode === "video" ? "videoinfo" : "imageinfo");
    if (mode === "video") {
      url.searchParams.set("viprop", "url|mime|derivatives|extmetadata");
      url.searchParams.set("viurlwidth", "1280");
    } else {
      url.searchParams.set("iiprop", "url|mime|size|extmetadata");
      url.searchParams.set("iiurlwidth", "1600");
    }
    url.searchParams.set("format", "json");

    try {
      const response = await fetch(url, {
        next: { revalidate: 21_600 },
        signal: AbortSignal.timeout(5_200),
        headers: { Accept: "application/json", "User-Agent": commonsAgent }
      });
      if (!response.ok) continue;
      const payload = await response.json() as {
        query?: { pages?: Record<string, CommonsVideoPage & CommonsPage> };
      };
      const ranked = Object.values(payload.query?.pages ?? {})
        .filter((entry) => {
          const title = normalized(entry.title ?? "");
          const isLocal = title.includes(normalized(city))
            || (airport.length >= 4 && title.includes(normalized(airport)));
          if (!isLocal) return false;
          if (scene === "airport" || scene === "approach") {
            return /airport|aeroport|aerodrome|runway|terminal|airfield|landing|approach|takeoff|take.off|flight|aircraft/.test(title)
              || (iata.length === 3 && title.includes(normalized(iata) + " airport"));
          }
          return true;
        })
        .sort((left, right) =>
          scenicScore(right.title ?? "", scene) - scenicScore(left.title ?? "", scene));

      for (const page of ranked) {
        const title = page.title ?? "";
        if (scenicScore(title, scene) < -7) continue;
        let item: DestinationMediaItem | null = null;
        if (mode === "video") {
          const info = page.videoinfo?.[0];
          const derivative = pickCommonsVideoDerivative(info?.derivatives);
          if (!derivative?.src) continue;
          const apple = (info?.derivatives ?? [])
            .filter((candidate) => {
              const type = (candidate.type ?? "").toLowerCase();
              return (type.includes("video/mp4") || type.includes("video/quicktime"))
                && candidate.src?.startsWith("https://")
                && (candidate.width ?? 0) >= (candidate.height ?? 0)
                && (candidate.width ?? 0) >= 360;
            })
            .sort((first, second) => (second.width ?? 0) - (first.width ?? 0))[0];
          item = {
            id: "commons-video-" + (page.pageid ?? hashString(derivative.src)),
            type: "video", scene, url: derivative.src,
            appleVideoUrl: apple?.src ?? null,
            preview: info?.thumburl?.startsWith("https://") ? info.thumburl : null,
            author: stripHtml(info?.extmetadata?.Artist?.value) || stripHtml(info?.extmetadata?.Credit?.value),
            sourceName: "Wikimedia Commons",
            sourceUrl: info?.descriptionurl?.startsWith("https://") ? info.descriptionurl : "https://commons.wikimedia.org/"
          };
        } else {
          const info = page.imageinfo?.[0];
          const mime = (info?.mime ?? "").toLowerCase();
          if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) continue;
          if (info?.width && info?.height && info.width < info.height * 1.18) continue;
          const mediaUrl = info?.thumburl || info?.url;
          if (!mediaUrl?.startsWith("https://")) continue;
          item = {
            id: "commons-" + (page.pageid ?? hashString(mediaUrl)),
            type: "image", scene, url: mediaUrl,
            preview: info?.thumburl?.startsWith("https://") ? info.thumburl : null,
            author: stripHtml(info?.extmetadata?.Artist?.value) || stripHtml(info?.extmetadata?.Credit?.value),
            sourceName: "Wikimedia Commons",
            sourceUrl: info?.descriptionurl?.startsWith("https://") ? info.descriptionurl : "https://commons.wikimedia.org/"
          };
        }
        if (item) unique.set(item.id, item);
      }
    } catch {
      // Commons may be slow or unavailable; continue with the other categories.
    }
  }
  return [...unique.values()].slice(0, mode === "video" ? 9 : 16);
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "tv-destination-media", 60, 60_000);
  if (limited) return limited;

  const city = cleanText(request.nextUrl.searchParams.get("city"), 80);
  const iata = cleanText(request.nextUrl.searchParams.get("iata"), 8).toUpperCase();
  const airport = cleanText(request.nextUrl.searchParams.get("airport"), 100);
  const cycle = clampInteger(request.nextUrl.searchParams.get("cycle"), 0, 99);

  if (city.length < 2) {
    return NextResponse.json(
      { ok: false, provider: "none", city, country: null, items: [], error: "Ville requise." },
      { status: 400 }
    );
  }

  const page = 1;
  const theme = mediaTheme(cycle + Math.floor(Date.now() / 21_600_000));
  try {
    const [pexels, pixabay, cityVideos, approachVideos, cityImages, airportImages, ambienceImages] =
      await Promise.all([
        fetchPexels(city, iata, page, theme).catch(() => null),
        fetchPixabay(city, iata, page, theme).catch(() => null),
        fetchCommonsScene(city, airport, iata, "city", "video"),
        fetchCommonsScene(city, airport, iata, "approach", "video"),
        fetchCommonsScene(city, airport, iata, "city", "image"),
        fetchCommonsScene(city, airport, iata, "airport", "image"),
        fetchCommonsScene(city, airport, iata, "ambience", "image")
      ]);

    const raw = [
      ...cityVideos, ...approachVideos,
      ...(pexels?.items ?? []),
      ...(pixabay?.items ?? []),
      ...airportImages, ...cityImages, ...ambienceImages
    ];
    const items = composeTvSequence(raw, cycle, 48);
    const provider = [
      pexels?.provider, pixabay?.provider,
      [...cityVideos, ...approachVideos, ...cityImages, ...airportImages, ...ambienceImages].length
        ? "Wikimedia Commons" : null
    ].filter(Boolean).join(" + ") || "none";
    return NextResponse.json(
      { ok: items.length > 0, provider, city, country: null, airport: airport || null,
        page, theme, count: items.length, items },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=21600" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, provider: "none", city, country: null, items: [],
        error: "Médias de destination momentanément indisponibles." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
