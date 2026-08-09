import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractSofiaNotams, formatSofiaCoordinate } from "../../lib/aviation/sofiaNotams";

export const dynamic = "force-dynamic";

const SOFIA_BASE = "https://sofia-briefing.aviation-civile.gouv.fr";
const SOFIA_FORM = `${SOFIA_BASE}/sofia/pages/notamsearcharea.html`;
const SOFIA_ENDPOINT = `${SOFIA_BASE}/sofia`;

function headers(cookie?: string) {
  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Referer: SOFIA_FORM,
    ...(cookie ? { Cookie: cookie } : {})
  };
}

async function postSofia(body: URLSearchParams, cookie: string, signal: AbortSignal) {
  return fetch(SOFIA_ENDPOINT, { method: "POST", headers: headers(cookie), body, cache: "no-store", signal });
}

function durationCode(start: Date, end: Date) {
  const minutes = Math.max(5, Math.min(72 * 60, Math.ceil((end.getTime() - start.getTime()) / 60_000)));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}${String(minutes % 60).padStart(2, "0")}`;
}

function requestData(latitude: number, longitude: number, uuid: string, validFrom: string, duration: string) {
  return {
    valid_from: validFrom,
    duration,
    traffic: "V",
    fl_lower: "0",
    fl_upper: "10",
    radius: "10",
    lat: formatSofiaCoordinate(latitude, "latitude"),
    long: formatSofiaCoordinate(longitude, "longitude"),
    uuid,
    isFromSofia: "true"
  };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 41 || latitude > 52 || longitude < -6 || longitude > 10) {
    return NextResponse.json({ error: "Coordonnées invalides pour la France." }, { status: 400 });
  }
  const requestedStart = request.nextUrl.searchParams.get("start");
  const requestedEnd = request.nextUrl.searchParams.get("end");
  const start = requestedStart ? new Date(requestedStart) : new Date();
  const end = requestedEnd ? new Date(requestedEnd) : new Date(start.getTime() + 12 * 60 * 60_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 72 * 60 * 60_000) {
    return NextResponse.json({ error: "Créneau de mission invalide ou supérieur à 72 heures." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const sessionResponse = await fetch(SOFIA_FORM, { cache: "no-store", signal: controller.signal });
    if (!sessionResponse.ok) throw new Error(`Initialisation SOFIA ${sessionResponse.status}`);
    const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Session SOFIA indisponible");

    const uuid = randomUUID();
    const queriedAt = new Date();
    const common = requestData(latitude, longitude, uuid, start.toISOString(), durationCode(start, end));
    const saveBody = new URLSearchParams({
      ":operation": "postsaveinsessionprepa",
      operation: "postAreaPibRequest",
      target: "#aside-target",
      href: "/sofia/pages/notamarea.html",
      typeVol: "",
      departure_date: start.toLocaleDateString("fr-FR", { timeZone: "UTC" }),
      departure_time: start.toISOString().slice(11, 16).replace(":", ""),
      lang: "fr",
      routeVal: "false",
      ...common
    });
    const saveResponse = await postSofia(saveBody, cookie, controller.signal);
    if (!saveResponse.ok) throw new Error(`Préparation SOFIA ${saveResponse.status}`);

    const dataResponse = await postSofia(new URLSearchParams({ ":operation": "postAreaPibRequest", ...common }), cookie, controller.signal);
    const envelope = await dataResponse.json() as { "status.message"?: string; "status.code"?: string };
    if (!dataResponse.ok || envelope["status.code"] !== "200" || !envelope["status.message"]) {
      throw new Error(`Recherche SOFIA ${dataResponse.status}`);
    }
    const payload = JSON.parse(envelope["status.message"]);
    const notams = extractSofiaNotams(payload, [latitude, longitude], queriedAt);
    return NextResponse.json({
      source: "SOFIA-Briefing — SIA/DSNA",
      officialUrl: SOFIA_FORM,
      queriedAt: queriedAt.toISOString(),
      validTo: typeof payload.validTo === "string" ? payload.validTo : null,
      center: { latitude, longitude },
      radiusNm: 10,
      lowerFl: 0,
      upperFl: 10,
      missionWindow: { start: start.toISOString(), end: end.toISOString() },
      notams
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "SOFIA-Briefing n’a pas répondu dans le délai prévu."
      : "Les NOTAM officiels sont temporairement indisponibles.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
