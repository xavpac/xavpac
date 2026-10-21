import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

type AviationNews = { title: string; date: string; source: string; link: string; summary: string; location: string };
const DAYS = 14;
const INCIDENT = /accident|crash|s.ecras|collision|panne|avarie|d.rout|atterrissage d.urgence|emergency landing|emergency descent|emergency|mayday|d.tresse|fum.e|incendie|feu . bord|p.ril|incident|pressurisation|d.pressurisation|urgence m.dicale|medical emergency|hard landing|runway excursion|evacuation|turbulence|engine failure|aircraft incident|airplane incident|aviation incident/i;
const AVIATION = /avion|aviation|a.rien|a.ronaut|a.roport|aircraft|airplane|plane|flight|airbus|boeing|helicopt|h.licopt|vol\b|compagnie a.rienne|airline|pilot|pilote|jet\b|atterrissage|landing|takeoff|d.collage|passager/i;
const EXCLUDE = /jeu vid.o|simulateur|film|s.rie t.l.|fiction|concert|musique|cin.ma/i;
const QUERIES = [
  "(avion OR aérien OR aviation OR hélicoptère) (accident OR panne OR urgence OR déroutement OR crash) when:14d",
  "(aircraft OR plane OR airline OR flight) (emergency OR crash OR incident OR emergency landing) when:14d",
  "(avion OR flight OR aircraft) (fumée OR panne moteur OR atterrissage urgence OR mayday OR dépressurisation) when:14d"
];
function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, " ").trim();
}
function tag(item: string, name: string): string {
  return decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? "");
}
async function getFeed(query: string): Promise<AviationNews[]> {
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=fr&gl=FR&ceid=FR:fr";
  const response = await fetch(url, {
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(7500),
    headers: { Accept: "application/rss+xml,application/xml", "User-Agent": "XavPac/6.5 (aviation news)" }
  });
  if (!response.ok) throw new Error("RSS " + response.status);
  const xml = await response.text();
  const cutoff = Date.now() - DAYS * 86400000;
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].flatMap((match): AviationNews[] => {
    const item = match[1];
    const rawDate = Date.parse(tag(item, "pubDate"));
    if (!Number.isFinite(rawDate) || rawDate < cutoff || rawDate > Date.now() + 600000) return [];
    const source = tag(item, "source") || "Source de presse non précisée";
    const title = tag(item, "title").replace(/\s+-\s+[^-]{1,80}$/, "").trim();
    const link = tag(item, "link");
    if (!title || !link || !AVIATION.test(title) || !INCIDENT.test(title) || EXCLUDE.test(title)) return [];
    return [{
      date: new Date(rawDate).toISOString(),
      title, link, source,
      summary: "Incident aéronautique rapporté par " + source + " : " + title,
      location: "Lieu non vérifié"
    }];
  });
}
export async function GET() {
  const results = await Promise.allSettled(QUERIES.map(getFeed));
  const available = results.filter((result): result is PromiseFulfilledResult<AviationNews[]> => result.status === "fulfilled");
  const items = available.flatMap((result) => result.value);
  const seen = new Set<string>();
  const incidents = items.sort((a,b) => Date.parse(b.date) - Date.parse(a.date)).filter((item) => {
    const key = item.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0,105);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 16);
  return NextResponse.json({
    source: "Google News RSS · presse internationale",
    fetchedAt: new Date().toISOString(),
    news: incidents,
    incidents,
    lastIncident: incidents[0] ?? null,
    coverage: available.length ? "partielle, dépend de la presse indexée" : "sources indisponibles",
    ...(available.length === 0 ? { error: "Veille presse momentanément indisponible" } : {})
  }, {
    status: available.length ? 200 : 503,
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" }
  });
}