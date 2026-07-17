import { cached } from "../cache.ts";
import { normalizeModeS, normalizeRegistration } from "../callsign.ts";
import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

type Photo = { thumbnail?: { src?: string }; thumbnail_large?: { src?: string }; link?: string; photographer?: string };

async function request(path: string) {
  const response = await fetch(`https://api.planespotters.net/pub/photos/${path}`, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(6500), headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` } });
  if (!response.ok) return null;
  const payload = await response.json();
  const photo = (Array.isArray(payload.photos) ? payload.photos[0] : null) as Photo | null;
  if (!photo) return null;
  const raw = photo.thumbnail_large?.src ?? photo.thumbnail?.src;
  if (!raw) return null;
  return { url: raw.startsWith("//") ? `https:${raw}` : raw, photographer: photo.photographer ?? null, link: photo.link ?? null };
}

type Input = { modeS?: string | null; registration?: string | null };
type Output = { url: string; photographer: string | null; link: string | null } | null;
const adapter: SourceAdapter<Input, Output> = {
  id: "planespotters", name: "PlaneSpotters", enabled: process.env.PLANESPOTTERS_ENABLED !== "false",
  quota: "API publique, usage raisonnable et cache long",
  async fetch(input) {
  const registration = normalizeRegistration(input.registration);
  const modeS = normalizeModeS(input.modeS)?.toLowerCase();
  const key = `photo:${registration ?? "none"}:${modeS ?? "none"}`;
  return cached(key, 7 * 86_400_000, async () => {
    if (registration) {
      const byRegistration = await request(`reg/${encodeURIComponent(registration)}`);
      if (byRegistration) return byRegistration;
    }
    return modeS ? request(`hex/${encodeURIComponent(modeS)}`) : null;
  });
  }
};
registerSource(adapter);

export async function lookupExactPhoto(input: Input): Promise<Output> {
  try { return await measuredFetch(adapter, input); } catch { return null; }
}
