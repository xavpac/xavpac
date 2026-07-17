import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function tag(item: string, name: string) { return decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? ""); }

export async function GET() {
  try {
    const query = encodeURIComponent('(aviation OR Airbus OR Boeing OR BEA OR aéroport) (accident OR incident OR enquête OR sécurité OR déroutement OR fermeture) when:7d');
    const response = await fetch(`https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000), headers: { "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` } });
    if (!response.ok) throw new Error(String(response.status));
    const xml = await response.text();
    const cutoff = Date.now() - 7 * 86400000;
    const aviationSubject = /\b(avion|aviation|aéronaut|aéroport|airbus|boeing|bea(?:-é)?|vol\b|flight|ryanair|air france|compagnie aérienne|hélicoptère|dérout)/i;
    const news = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
      const item = match[1], date = new Date(tag(item, "pubDate"));
      const source = tag(item, "source") || "Source non déterminée";
      const rawTitle = tag(item, "title");
      const title = rawTitle.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`, "i"), "");
      return { date: date.toISOString(), title, summary: `Article publié par ${source} au sujet de : ${title}.`, location: "Non déterminée", source, link: tag(item, "link") };
    }).filter((item) => Date.parse(item.date) >= cutoff && aviationSubject.test(item.title) && item.title && item.link).slice(0, 8);
    return NextResponse.json({ source: "Google News RSS — éditeurs indiqués par article", fetchedAt: new Date().toISOString(), news }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch { return NextResponse.json({ source: "Google News RSS", news: [], error: "Actualités aéronautiques momentanément indisponibles." }, { status: 502 }); }
}
