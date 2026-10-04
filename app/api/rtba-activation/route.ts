import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { classifyAzbaSlots, normalizeRtbaCode, type AzbaActivationSlot, type AzbaLiveFeed } from "../../lib/aviation/azbaLive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AZBA_APP_URL = "https://www.sia.aviation-civile.gouv.fr/azbaEx/";
const CONFIG_TTL_MS = 6 * 60 * 60 * 1000;

type AzbaConfig = {
  apiBase: string;
  apiVersion: string;
  shareSecret: string;
};

let cachedConfig: { value: AzbaConfig; expiresAt: number } | null = null;

function absoluteUrl(base: string, value: string) {
  return new URL(value, base).toString();
}

async function discoverAzbaConfig(): Promise<AzbaConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) return cachedConfig.value;

  const page = await fetch(AZBA_APP_URL, {
    cache: "no-store",
    headers: { Accept: "text/html", "User-Agent": "XavPac/1.0 AZBA public data client" }
  });
  if (!page.ok) throw new Error(`AZBA app ${page.status}`);
  const html = await page.text();

  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi)]
    .map((match) => absoluteUrl(AZBA_APP_URL, match[1]))
    .reverse();

  if (!scripts.length) throw new Error("Bundle AZBA introuvable");

  for (const scriptUrl of scripts) {
    const response = await fetch(scriptUrl, {
      next: { revalidate: 21_600 },
      headers: { Accept: "application/javascript", "User-Agent": "XavPac/1.0 AZBA public data client" }
    });
    if (!response.ok) continue;
    const source = await response.text();

    const secret = source.match(/share_secret\s*:\s*["']([^"']+)["']/i)?.[1];
    const apiBase = source.match(/baseUrl\s*:\s*["'](https:\/\/[^"']+\/api\/)["']/i)?.[1];
    const apiVersion = source.match(/azbaApiVersion\s*:\s*["']([^"']+)["']/i)?.[1] ?? "v3/";

    if (secret && apiBase) {
      const value = { apiBase, apiVersion, shareSecret: secret };
      cachedConfig = { value, expiresAt: Date.now() + CONFIG_TTL_MS };
      return value;
    }
  }

  throw new Error("Configuration publique AZBA non reconnue");
}

function authHeader(secret: string, pathWithQuery: string) {
  const tokenUri = createHash("sha512").update(`${secret}/api/${pathWithQuery}`).digest("hex");
  return Buffer.from(JSON.stringify({ tokenUri })).toString("base64");
}

async function officialGet(config: AzbaConfig, pathWithQuery: string) {
  const response = await fetch(`${config.apiBase}${pathWithQuery}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      AUTH: authHeader(config.shareSecret, pathWithQuery),
      "User-Agent": "XavPac/1.0 AZBA public data client"
    },
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) throw new Error(`AZBA API ${response.status}`);
  return response.json();
}

function isoMs(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export async function GET() {
  try {
    const config = await discoverAzbaConfig();
    const version = config.apiVersion.endsWith("/") ? config.apiVersion : `${config.apiVersion}/`;
    const range = await officialGet(config, `${version}custom/currentDate`) as {
      startDate?: string;
      endDate?: string;
    };

    if (!range.startDate || !range.endDate) throw new Error("Période AZBA absente");

    const startMs = isoMs(range.startDate);
    const endMs = isoMs(range.endDate);
    const nowMs = Date.now();

    if (
      startMs === null ||
      endMs === null ||
      endMs <= startMs ||
      nowMs > endMs ||
      nowMs < startMs - 6 * 60 * 60 * 1000
    ) {
      throw new Error("Période AZBA périmée ou incohérente");
    }

    const path = `${version}r_t_b_as?itemsPerPage=600&debutIntervalTemps=${encodeURIComponent(range.startDate)}&finIntervalTemps=${encodeURIComponent(range.endDate)}`;
    const rawZones = await officialGet(config, path) as Array<{
      codeId?: string;
      timeSlots?: Array<{ startTime?: string; endTime?: string }>;
    }>;

    if (!Array.isArray(rawZones)) throw new Error("Réponse zones AZBA invalide");

    const zones = rawZones.map((zone) => {
      if (!zone.codeId || !Array.isArray(zone.timeSlots)) throw new Error("Zone AZBA incomplète");
      const activations: AzbaActivationSlot[] = zone.timeSlots.map((slot) => {
        if (!slot.startTime || !slot.endTime) throw new Error("Créneau AZBA incomplet");
        return { startUtc: new Date(slot.startTime).toISOString(), endUtc: new Date(slot.endTime).toISOString() };
      });
      const state = classifyAzbaSlots(activations, nowMs, startMs, endMs);
      return {
        code: normalizeRtbaCode(zone.codeId),
        activations,
        ...state
      };
    });

    const feed: AzbaLiveFeed = {
      source: "SIA/AZBA officiel",
      retrievedAt: new Date().toISOString(),
      validityStartUtc: new Date(startMs).toISOString(),
      validityEndUtc: new Date(endMs).toISOString(),
      state: "available",
      message: "Créneaux officiels AZBA reçus et validés.",
      zones
    };

    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=240, stale-while-revalidate=60" }
    });
  } catch {
    const feed: AzbaLiveFeed = {
      source: "SIA/AZBA officiel",
      retrievedAt: new Date().toISOString(),
      validityStartUtc: null,
      validityEndUtc: null,
      state: "unavailable",
      message: "Donnée AZBA indisponible : XavPac n’affiche pas de faux statut inactif.",
      zones: []
    };
    return NextResponse.json(feed, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
