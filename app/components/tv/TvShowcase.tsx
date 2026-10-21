"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { XAVPAC_HOME } from "../../config/home";
import { distanceKm } from "../../lib/aviation/geometry";
import { classifyAircraftVisual } from "../../lib/aviation/aircraftVisual";
import type { LiveAircraft } from "../../lib/aviation/liveAircraft";
import type { EnrichedAircraft } from "../../lib/aviation/types";
import type { MapPoint } from "../StableMap";

const StableMap = dynamic(() => import("../StableMap"), { ssr: false });
const RADIUS_KM = 50; // zone radar
const SHOWCASE_DISTANCE_KM = 50;
const PRIORITY_DISTANCE_KM = 20;
const ALERT_DURATION_MS = 5 * 60 * 1000;
const HOME = XAVPAC_HOME.position;

type TrackedAircraft = LiveAircraft & { distance: number };
type DestinationMedia = { id: string; type: "video" | "image"; url: string; preview: string | null; sourceName: string; author: string | null };
type MediaPayload = { items?: DestinationMedia[]; provider?: string };
type EnrichmentPayload = { enriched?: EnrichedAircraft[] };
type TrafficPayload = { aircraft?: LiveAircraft[]; fetchedAt?: string; source?: string };
type AviationArticle = { title: string; date: string; source: string; link?: string };
type NewsPayload = { news?: AviationArticle[] };
type ObservedAlert = { key: string; aircraft: string; code: string; detectedAt: string };
type ObservedPriority = { key: string; label: string; aircraft: string; detectedAt: string };
const TECHNICAL_REPORT = /panne|avarie|probl[eè]me technique|incident technique|pressurisation|d[eé]pressurisation|panne moteur|crash|accident|emergency landing|atterrissage d.urgence|urgence|d[eé]tresse|mayday/i;
const EMERGENCY_CODES = ["7700", "7600", "7500"];
const incidentLabel = (code: string) => code === "7700"
  ? "URGENCE SIGNALÉE · CAUSE NON CONFIRMÉE"
  : code === "7600" ? "DÉFAILLANCE RADIO SIGNALÉE" : "INTERVENTION ILLICITE SIGNALÉE";
const capFrancais = (angle: number | null | undefined) => {
  if (angle == null || !Number.isFinite(angle)) return "—";
  const d = ["nord", "nord-nord-est", "nord-est", "est-nord-est", "est", "est-sud-est", "sud-est", "sud-sud-est", "sud", "sud-sud-ouest", "sud-ouest", "ouest-sud-ouest", "ouest", "ouest-nord-ouest", "nord-ouest", "nord-nord-ouest"];
  return d[Math.floor((((angle % 360) + 360) % 360 + 11.25) / 22.5) % 16];
};

const cityFrancais = (name: string | null | undefined) => {
  if (!name?.trim()) return "Ville non renseignée";
  const common: Record<string, string> = {
    London: "Londres", Frankfurt: "Francfort", Montreal: "Montréal",
    Geneva: "Genève", Brussels: "Bruxelles", Lisbon: "Lisbonne",
    Vienna: "Vienne", Prague: "Prague", Warsaw: "Varsovie",
    Moscow: "Moscou", Rome: "Rome", Florence: "Florence"
  };
  return common[name] ?? name;
};
const airportCity = (a?: EnrichedAircraft["arrivalAirport"]) =>
  a ? cityFrancais(a.municipality || a.name) : "Ville non renseignée";

const alertDate = (value?: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date/heure indisponibles";
  return new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatNumber = (value: number | null | undefined, suffix: string) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("fr-FR") + suffix : "—";

function specialLabel(item: TrackedAircraft, enriched?: EnrichedAircraft | null) {
  const details = [item.callsign, item.operator, item.description, item.aircraftType, enriched?.operator, enriched?.aircraftType].filter(Boolean).join(" ").toLowerCase();
  if (/sécurité civile|securite civile|dragon[ -]?\d{2}|canadair|bombardier d.eau|fire ?boss|dash ?8.*feu/.test(details)) return "SÉCURITÉ CIVILE";
  const family = classifyAircraftVisual(item.aircraftType, item.description, item.operator, item.category, enriched?.aircraftType);
  if (family.kind === "military" || /armée|armee|air force|rafale|mirage|a400m|military|militaire|alat|marine nationale/.test(details)) return "ARMÉE";
  return null;
}

function aircraftGlyph(item: TrackedAircraft, enriched?: EnrichedAircraft | null) {
  const family = classifyAircraftVisual(item.aircraftType, item.description, item.operator, item.category, enriched?.aircraftType);
  return family.kind === "helicopter" || /hélic|helic|rotor|\bh145\b|\bec145\b/i.test([item.description, item.aircraftType].join(" "))
    ? "🚁" : "✈";
}

function placeName(value: EnrichedAircraft["arrivalAirport"]) {
  return value?.municipality?.trim() || value?.name?.trim() || "";
}

function code(value: EnrichedAircraft["arrivalAirport"]) {
  return value?.iata || value?.icao || "—";
}


// Photographies exactes seulement si la source l'indique ; sinon mention du substitut.
function AircraftVisual({ info, className = "" }: { info?: EnrichedAircraft | null; className?: string }) {
  const src = info?.photo?.url;
  const logo = info?.logo && !info.logo.includes("generic") ? info.logo : null;
  return <div className={"tv-v5-aircraft-visual " + className}>
    <span className="tv-v5-photo-placeholder" aria-hidden="true">✈</span>
    {src && <img alt={info?.photo.kind === "exact" ? "Photo de cet avion" : "Illustration de l'aéronef"}
      src={src} loading="eager" onError={(event) => {event.currentTarget.style.display = "none";}} />}
    {logo && <span className="tv-v5-logo"><img src={logo} alt="Logo de la compagnie selon identification"
      onError={(event) => {event.currentTarget.parentElement?.remove();}} /></span>}
    {info?.photo && info.photo.kind !== "exact" &&
      <span className="tv-v5-photo-note">{info.photo.kind === "generic" ? "Illustration" : "Photo illustrative"}</span>}
  </div>;
}

export default function TvShowcase() {
  const [traffic, setTraffic] = useState<TrackedAircraft[]>([]);
  const [enriched, setEnriched] = useState<Record<string, EnrichedAircraft>>({});
  const [media, setMedia] = useState<DestinationMedia[]>([]);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [badMedia, setBadMedia] = useState<string[]>([]);
  const [mediaStatus, setMediaStatus] = useState("ready");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [connection, setConnection] = useState("Connexion au trafic...");
  const [now, setNow] = useState<Date | null>(null);
  const [news, setNews] = useState<AviationArticle[]>([]);
  const [lastEmergency, setLastEmergency] = useState<ObservedAlert | null>(null);
  const [lastPriority, setLastPriority] = useState<ObservedPriority | null>(null);
  const [worldAlert, setWorldAlert] = useState<{ key: string; detectedAt: string } | null>(null);
  const seenWorldArticle = useRef<string | null>(null);
  const priorityLostAt = useRef<number | null>(null);
  const emergencyLostAt = useRef<number | null>(null);
  const alertAudioContext = useRef<AudioContext | null>(null);
  const playAlert = (kind: "priority" | "emergency") => {
    // Le navigateur peut refuser l'audio automatique sans interaction préalable.
    try {
      const context = alertAudioContext.current ?? new AudioContext();
      alertAudioContext.current = context;
      if (context.state === "suspended") void context.resume().catch(() => {});
      const tones = kind === "priority" ? [600, 840] : [1050, 720, 1050];
      tones.forEach((hz, idx) => {
        const o = context.createOscillator();
        const gain = context.createGain();
        o.type = kind === "priority" ? "sine" : "square";
        o.frequency.setValueAtTime(hz, context.currentTime + idx * 0.21);
        gain.gain.setValueAtTime(0.0001, context.currentTime + idx * 0.21);
        gain.gain.exponentialRampToValueAtTime(kind === "priority" ? 0.12 : 0.08, context.currentTime + idx * 0.21 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + idx * 0.21 + 0.17);
        o.connect(gain).connect(context.destination);
        o.start(context.currentTime + idx * 0.21);
        o.stop(context.currentTime + idx * 0.21 + 0.18);
      });
    } catch { /* Son limité par les règles du navigateur ; alerte visuelle maintenue. */ }
  };
  const seenEmergency = useRef<string | null>(null);
  const seenPriority = useRef<string | null>(null);
  const enrichTime = useRef(0);
  const mediaRequest = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoProgress = useRef<{ url: string; position: number; time: number } | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let busy = false;

    async function refresh() {
      if (busy || disposed) return;
      busy = true;
      try {
        const url = "/api/aircraft?lat=" + HOME[0] + "&lon=" + HOME[1] + "&radius=" + RADIUS_KM;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("source indisponible");
        const result = await response.json() as TrafficPayload;
        if (disposed) return;
        const nearby = (Array.isArray(result.aircraft) ? result.aircraft : [])
          .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && !item.onGround)
          .map((item) => ({ ...item, distance: distanceKm(HOME, [item.latitude, item.longitude]) }))
          .filter((item) => item.distance <= RADIUS_KM && (item.positionAgeSeconds ?? 0) < 120)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 100);
        setTraffic(nearby);
        setUpdatedAt(result.fetchedAt || new Date().toISOString());
        setConnection("DONNÉES EN DIRECT");

        if (Date.now() - enrichTime.current >= 45000 && nearby.length) {
          enrichTime.current = Date.now();
          const input = nearby.slice(0, 15).map((item) => ({
            modeS: item.id, registration: item.registration, callsign: item.callsign,
            operator: item.operator, aircraftType: item.aircraftType, description: item.description,
            category: item.category, positionSource: item.positionSource, distanceKm: item.distance
          }));
          void fetch("/api/aviation/enriched-aircraft", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aircraft: input, selectedModeS: input[0]?.modeS }),
            cache: "no-store"
          }).then(async (r) => {
            if (!r.ok) throw new Error("enrichissement indisponible");
            return await r.json() as EnrichmentPayload;
          }).then((payload) => {
            if (disposed) return;
            setEnriched((previous) => ({
              ...previous,
              ...Object.fromEntries((payload.enriched ?? []).map((entry) => [entry.modeS.replace(/^~/, "").toUpperCase(), entry]))
            }));
          }).catch(() => { /* Conserver le radar même si l'enrichissement échoue. */ });
        }
      } catch {
        if (!disposed) setConnection("LIAISON TEMPORAIREMENT INDISPONIBLE");
      } finally {
        busy = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  // Une actualité n'est pas une alerte transpondeur, ni une panne confirmée.
  useEffect(() => {
    let disposed = false;
    async function refreshNews() {
      try {
        const response = await fetch("/api/aviation-news", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as NewsPayload;
        if (!disposed) setNews((payload.news ?? []).filter((item) => item.title && item.date && item.source));
      } catch { /* Pas d'évènement fabriqué si la veille presse est indisponible. */ }
    }
    void refreshNews();
    const timer = window.setInterval(() => { void refreshNews(); }, 900000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  const feedFresh = connection === "DONNÉES EN DIRECT"
    && Boolean(updatedAt && Number.isFinite(Date.parse(updatedAt)))
    && Boolean(now && Date.now() - Date.parse(updatedAt ?? "") < 40000);

  useEffect(() => {
    if (!feedFresh) return;
    const emergency = traffic.find((item) =>
      EMERGENCY_CODES.includes(item.squawk ?? "") && (item.positionAgeSeconds ?? 0) < 90);
    const key = emergency ? emergency.id + "-" + emergency.squawk : null;
    if (key && emergency) {
      const loss = emergencyLostAt.current;
      if (loss && Date.now() - loss >= 120000) seenEmergency.current = null;
      emergencyLostAt.current = null;
      if (key !== seenEmergency.current) {
        seenEmergency.current = key;
        setLastEmergency({ key, aircraft: emergency.callsign || emergency.registration || emergency.id,
          code: emergency.squawk ?? "", detectedAt: new Date().toISOString() });
        playAlert("emergency");
      }
    } else if (emergencyLostAt.current === null) {
      emergencyLostAt.current = Date.now();
    }
  }, [traffic, feedFresh]);

  const mapPoints = useMemo<MapPoint[]>(() => [
    { id: "home-tv", lat: HOME[0], lon: HOME[1], name: "HOME", category: "home", detail: "Bâgé-Dommartin" },
    ...traffic.map((item, index) => {
      const details = enriched[item.id.replace(/^~/, "").toUpperCase()];
      const priority = specialLabel(item, details);
      const route = details?.departureAirport && details?.arrivalAirport
        ? code(details.departureAirport) + " → " + code(details.arrivalAirport)
        : details?.flightNumberIata || item.callsign || "ADS-B";
      const helicopter = aircraftGlyph(item, details) === "🚁";
      return {
        id: item.id, lat: item.latitude, lon: item.longitude, name: route,
        rank: index < 3 ? (index + 1) as 1 | 2 | 3 : undefined,
        category: priority === "ARMÉE" ? "national-military" : priority === "SÉCURITÉ CIVILE" ? "national-dragon" : helicopter ? "helicopter" : "aircraft",
        color: priority === "ARMÉE" ? "#ffbe2e" : priority === "SÉCURITÉ CIVILE" ? "#ff415c" : "#138ad0",
        heading: item.trueTrack,
        detail: (item.callsign || "Vol") + " • " + item.distance.toFixed(1) + " km"
      };
    })
  ], [traffic, enriched]);

  const candidate = useMemo(() => {
    return traffic
      .filter((item) => item.distance <= SHOWCASE_DISTANCE_KM)
      .map((item) => ({ item, details: enriched[item.id.replace(/^~/, "").toUpperCase()] }))
      .filter(({ details }) => Boolean(details?.arrivalAirport && placeName(details.arrivalAirport) && details.routeConfidence !== "unavailable"))
      .sort((a, b) => a.item.distance - b.item.distance)[0] ?? null;
  }, [traffic, enriched]);

  const nearbyAlert = useMemo(() => traffic
    .map((item) => ({ item, priority: specialLabel(item, enriched[item.id.replace(/^~/, "").toUpperCase()]) }))
    .find(({ item, priority }) => priority !== null && item.distance <= PRIORITY_DISTANCE_KM && (item.positionAgeSeconds ?? 0) < 90) ?? null, [traffic, enriched]);

  useEffect(() => {
    if (!feedFresh) return;
    const key = nearbyAlert ? nearbyAlert.item.id + "-" + nearbyAlert.priority : null;
    if (key && nearbyAlert) {
      const loss = priorityLostAt.current;
      if (loss && Date.now() - loss >= 120000) seenPriority.current = null;
      priorityLostAt.current = null;
      if (key !== seenPriority.current) {
        seenPriority.current = key;
        setLastPriority({ key, label: nearbyAlert.priority || "MOYEN PRIORITAIRE",
          aircraft: nearbyAlert.item.callsign || nearbyAlert.item.registration || nearbyAlert.item.id,
          detectedAt: new Date().toISOString() });
        playAlert("priority");
      }
    } else if (priorityLostAt.current === null) {
      priorityLostAt.current = Date.now();
    }
  }, [nearbyAlert, feedFresh]);

  useEffect(() => {
    const recent = news.filter((item) => TECHNICAL_REPORT.test(item.title))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    if (!recent) return;
    const key = recent.title + "|" + recent.date;
    if (seenWorldArticle.current === null) { seenWorldArticle.current = key; return; }
    if (seenWorldArticle.current !== key && Date.now() - Date.parse(recent.date) < 30 * 60000) {
      seenWorldArticle.current = key;
      setWorldAlert({ key, detectedAt: new Date().toISOString() });
      playAlert("emergency");
    }
  }, [news]);

  const featured = candidate?.item ?? traffic[0] ?? null;
  const featuredInfo = featured ? enriched[featured.id.replace(/^~/, "").toUpperCase()] : null;
  const destination = candidate?.details?.arrivalAirport ?? null;
  const city = placeName(destination);
  const destinationKey = city ? city.toLocaleLowerCase("fr-FR") + ":" + code(destination) : "";

  useEffect(() => {
    const requestId = ++mediaRequest.current;
    setMedia([]);
    setMediaIndex(0);
    setBadMedia([]);
    setMediaStatus(destinationKey ? "loading" : "ready");
    if (!destinationKey) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const endpoint = "/api/tv/destination-media?city=" + encodeURIComponent(city)
      + "&iata=" + encodeURIComponent(destination?.iata || "")
      + "&icao=" + encodeURIComponent(destination?.icao || "")
      + "&airport=" + encodeURIComponent(destination?.name || "")
      + "&cycle=" + Math.floor(Date.now() / 21600000) % 10;
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("médias indisponibles");
        return await response.json() as MediaPayload;
      })
      .then((payload) => {
        if (mediaRequest.current !== requestId) return;
        const items = (payload.items ?? []).filter((item) =>
          (item.type === "image" || item.type === "video") && item.url.startsWith("https://"));
        const videoIndex = items.findIndex((item) => item.type === "video");
        setMedia(items);
        setMediaIndex(videoIndex >= 0 ? videoIndex : 0);
        setMediaStatus(items.length ? "ready" : "empty");
      })
      .catch(() => { if (!disposed && mediaRequest.current === requestId) setMediaStatus("empty"); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [destinationKey, city, destination?.iata, destination?.icao, destination?.name]);

  const playableMedia = useMemo(() => media.filter((item) => !badMedia.includes(item.url)), [media, badMedia]);
  const activeMedia = playableMedia.length ? playableMedia[mediaIndex % playableMedia.length] : null;
  useEffect(() => {
    if (!activeMedia) return;
    const timer = window.setTimeout(() => setMediaIndex((index) => index + 1), activeMedia.type === "video" ? 19000 : 10000);
    return () => window.clearTimeout(timer);
  }, [activeMedia]);
  useEffect(() => {
    if (!activeMedia || activeMedia.type !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    videoProgress.current = { url: activeMedia.url, position: 0, time: Date.now() };
    const failed = () => setBadMedia((previous) =>
      previous.includes(activeMedia.url) ? previous : [...previous, activeMedia.url]);
    void video.play().catch(failed);
    const watchdog = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const player = videoRef.current;
      const progress = videoProgress.current;
      if (!player || !progress || progress.url !== activeMedia.url) return;
      if (player.currentTime > progress.position + 0.12) {
        videoProgress.current = { url: activeMedia.url, position: player.currentTime, time: Date.now() };
      } else if (Date.now() - progress.time > 8000) {
        // Une vidéo bloquée cède sa place au média suivant.
        failed();
      }
    }, 2000);
    return () => window.clearInterval(watchdog);
  }, [activeMedia]);

  const clock = now ? now.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "--:--";
  const today = now ? now.toLocaleDateString("fr-FR", { weekday:"short", day:"2-digit", month:"short", year:"numeric" }) : "";
  const activeEmergency = feedFresh ? traffic.find((item) =>
    EMERGENCY_CODES.includes(item.squawk ?? "") && (item.positionAgeSeconds ?? 0) < 90) : null;
  const latestArticle = news.filter((item) => TECHNICAL_REPORT.test(item.title))
    .sort((a,b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;
  const activeKey = activeEmergency ? activeEmergency.id + "-" + activeEmergency.squawk : null;
  const emergencyFlash = Boolean(activeKey && lastEmergency?.key === activeKey &&
    now && now.getTime() - Date.parse(lastEmergency.detectedAt) < ALERT_DURATION_MS);
  const newsFlash = Boolean(worldAlert && latestArticle &&
    worldAlert.key === latestArticle.title + "|" + latestArticle.date &&
    now && now.getTime() - Date.parse(worldAlert.detectedAt) < ALERT_DURATION_MS);
  const currentPriorityKey = nearbyAlert ? nearbyAlert.item.id + "-" + nearbyAlert.priority : null;
  const priorityTakeover = Boolean(feedFresh && nearbyAlert && lastPriority &&
    currentPriorityKey === lastPriority.key &&
    now && now.getTime() - Date.parse(lastPriority.detectedAt) < ALERT_DURATION_MS);
  const priorityRemaining = priorityTakeover && now && lastPriority
    ? Math.max(0, Math.ceil((ALERT_DURATION_MS - (now.getTime() - Date.parse(lastPriority.detectedAt))) / 1000))
    : 0;
  const priorityInfo = nearbyAlert ? enriched[nearbyAlert.item.id.replace(/^~/, "").toUpperCase()] : null;

  // Les informations d'un article de presse ne sont pas des codes transpondeur confirmés.
  const lastKnownIsAdsb = Boolean(lastEmergency && (!latestArticle ||
    Date.parse(lastEmergency.detectedAt) >= Date.parse(latestArticle.date)));
  const alertName = activeEmergency
    ? incidentLabel(activeEmergency.squawk ?? "")
    : lastKnownIsAdsb && lastEmergency
      ? incidentLabel(lastEmergency.code) + " · " + lastEmergency.aircraft
      : latestArticle?.title || "Aucune urgence documentée disponible";
  const alertTimestamp = activeEmergency && lastEmergency?.key === activeKey
    ? lastEmergency.detectedAt
    : lastKnownIsAdsb ? lastEmergency?.detectedAt : latestArticle?.date;
  const alertSource = activeEmergency || lastKnownIsAdsb
    ? "Signal ADS-B · heure de détection" : latestArticle?.source || "Couverture ADS-B partielle";

  const showFlight = Boolean(candidate && destination);
  const first = traffic[0] ?? null;
  const firstInfo = first ? enriched[first.id.replace(/^~/, "").toUpperCase()] : null;
  const firstDeparture = firstInfo?.departureAirport ? code(firstInfo.departureAirport) : "—";
  const firstArrival = firstInfo?.arrivalAirport ? code(firstInfo.arrivalAirport) : "—";
  const firstDepartureCity = airportCity(firstInfo?.departureAirport);
  const firstArrivalCity = airportCity(firstInfo?.arrivalAirport);

  return (
    <main className="xavpac-tv tv-v5" aria-label="XAVPAC TV SKY SHOW — Radar et vols réels sans interaction">
      <header className="tv-v5-header">
        <div className="tv-v5-title"><span className="tv-v5-title-icon">✈</span>
          <div><strong>XAVPAC TV <span>· SKY SHOW</span></strong>
          <small>SUIVI DES VOLS · BÂGÉ-DOMMARTIN</small></div>
        </div>
        <div className="tv-v5-headmeta">
          <span className={"tv-v5-connection " + (feedFresh ? "is-live" : "is-stale")}>
            <i />{feedFresh ? "DONNÉES ADS-B ACTUALISÉES" : connection}
          </span>
          <span>{today}</span><strong>{clock}</strong>
        </div>
      </header>
      <div className="tv-v5-layout">
        <section className="tv-v5-map" aria-label="Carte réelle des aéronefs dans les 50 km">
          <div className="tv-map-static">
            <StableMap points={mapPoints} center={HOME} radiusKm={RADIUS_KM}
              showRadius mapVariant="street" controls={false} zoom={9}
              selectedId={priorityTakeover ? nearbyAlert?.item.id : first?.id ?? null} />
          </div>
          <div className="tv-v5-map-top">
            <span>CARTE AÉRIENNE · 50 KM</span>
            <b>{feedFresh ? traffic.length + " AÉRONEF" + (traffic.length > 1 ? "S" : "") : "RADAR EN ATTENTE"}</b>
          </div>
          <div className="tv-v5-map-legend">
            <div><i className="tv-v5-dot tv-v5-dot-red" />Sécurité civile</div>
            <div><i className="tv-v5-dot tv-v5-dot-gold" />Armée</div>
            <div><i className="tv-v5-dot tv-v5-dot-blue" />Autres aéronefs</div>
          </div>
          <div className="tv-v5-map-footer">Repères 1 · 2 · 3 : mêmes avions que les fiches <span>{updatedAt ? "Relevé : " + alertDate(updatedAt) : "Positions non disponibles"}</span></div>
        </section>

        <aside className="tv-v5-side">
          <section className="tv-v5-media-frame" aria-label="Vidéo immersive de la destination">
            <div className="tv-v5-media">
              {showFlight && activeMedia?.type === "video" && <video
                key={activeMedia.url} ref={videoRef} className="tv-destination-video"
                src={activeMedia.url} autoPlay muted playsInline preload="auto"
                poster={activeMedia.preview || undefined}
                onCanPlay={() => {const v=videoRef.current; if(v) void v.play().catch(() => {});}}
                onError={() => setBadMedia((previous) => previous.includes(activeMedia.url) ? previous : [...previous, activeMedia.url])}
                onEnded={() => setMediaIndex((index) => index + 1)}
              />}
              {showFlight && activeMedia?.type === "image" && <div key={activeMedia.url}
                className="tv-destination-image" style={{backgroundImage:"url(" + JSON.stringify(activeMedia.url) + ")"}} />}
              {(!showFlight || !activeMedia) && <div className="tv-v5-media-empty"><span>✈</span><strong>{mediaStatus === "loading" ? "Recherche de médias…" : "ESCALE IMMERSIVE"}</strong><small>Vidéo et photographies à partir des destinations identifiées</small></div>}
              <div className="tv-v5-media-overlay" />
              <div className="tv-v5-media-heading"><b>▣ VUE IMMERSIVE</b>
                <span>{activeMedia?.type === "video" ? "VIDÉO · SANS SON" : "PHOTO · VIDÉO SI DISPONIBLE"}</span>
              </div>
              <div className="tv-v5-media-caption">
                <strong>{showFlight ? cityFrancais(city) : "Prochaine destination"}</strong>
                <small>{showFlight ? code(destination) + " · Source : " + (activeMedia?.sourceName ?? "Recherche en cours") : "En attente d'une route aérienne identifiée"}</small>
              </div>
            </div>
          </section>

          {priorityTakeover && nearbyAlert ? (
            <section className="tv-v5-takeover tv-v5-flash-priority" aria-live="assertive">
              <div className="tv-v5-takeover-head">
                <strong>🚨 MOYEN PRIORITAIRE DÉTECTÉ</strong>
                <span>{String(Math.floor(priorityRemaining/60)).padStart(2,"0")}:{String(priorityRemaining%60).padStart(2,"0")} · ALERTE</span>
              </div>
              <div className="tv-v5-takeover-main">
                <div className="tv-v5-takeover-details">
                  <b>{nearbyAlert.item.callsign || nearbyAlert.item.registration || nearbyAlert.item.id}</b>
                  <strong>{nearbyAlert.priority} · {priorityInfo?.aircraftModel || nearbyAlert.item.description || nearbyAlert.item.aircraftType || "TYPE NON CONFIRMÉ"}</strong>
                  <span>DÉPART · {airportCity(priorityInfo?.departureAirport)}</span>
                  <span>ARRIVÉE · {airportCity(priorityInfo?.arrivalAirport)}</span>
                  <small>{priorityInfo?.routeConfidence === "confirmed" ? "TRAJET CONFIRMÉ" : "TRAJET NON CONFIRMÉ"} · Détecté le {alertDate(lastPriority?.detectedAt)}</small>
                </div>
                <AircraftVisual info={priorityInfo} className="tv-v5-takeover-photo" />
              </div>
              <div className="tv-v5-takeover-stats">
                <span>ALTITUDE <b>{formatNumber(nearbyAlert.item.barometricAltitude," m")}</b></span>
                <span>VITESSE <b>{nearbyAlert.item.velocity != null ? formatNumber(nearbyAlert.item.velocity*3.6," km/h") : "—"}</b></span>
                <span>CAP <b>{capFrancais(nearbyAlert.item.trueTrack)}</b></span>
                <span>DISTANCE <b>{nearbyAlert.item.distance.toFixed(1)} km</b></span>
              </div>
            </section>
          ) : <>
            <section className="tv-v5-flight-primary" aria-label="Avion numéro un">
              <div className="tv-v5-primary-head">
                <span className="tv-v5-rank rank1">1</span>
                <AircraftVisual info={firstInfo} className="tv-v5-photo-primary" />
                <div className="tv-v5-primary-title">
                  <strong>{firstInfo?.flightNumberIata || first?.callsign || first?.registration || "AVION 1 · EN ATTENTE"}</strong>
                  <span>{firstInfo?.aircraftModel || first?.description || first?.aircraftType || "TYPE NON IDENTIFIÉ"}</span>
                  <small>{firstInfo?.operator || first?.operator || "Opérateur non identifié"} · {firstInfo?.photo?.source || "Pas de photographie référencée"}</small>
                </div>
                <span className="tv-v5-rank-label">N° 1</span>
              </div>
              <div className="tv-v5-primary-route">
                <span><small>DÉPART</small><b>{firstDepartureCity}</b><em>{firstDeparture}</em></span>
                <i>✈</i>
                <span><small>ARRIVÉE</small><b>{firstArrivalCity}</b><em>{firstArrival}</em></span>
              </div>
              <div className="tv-v5-primary-metrics">
                <span><small>ALTITUDE</small><strong>{first ? formatNumber(first.barometricAltitude," m") : "—"}</strong></span>
                <span><small>VITESSE SOL</small><strong>{first?.velocity != null ? formatNumber(first.velocity*3.6," km/h") : "—"}</strong></span>
                <span><small>CAP</small><strong>{capFrancais(first?.trueTrack)}</strong></span>
                <span><small>DISTANCE MAISON</small><strong>{first ? first.distance.toFixed(1)+" km" : "—"}</strong></span>
              </div>
              <div className="tv-v5-provenance">{firstInfo?.routeConfidence === "confirmed" ? "TRAJET CONFIRMÉ" : "TRAJET NON CONFIRMÉ"}
                <span>{first?.feedSource || "ADS-B"} · {first?.positionAgeSeconds != null ? Math.round(first.positionAgeSeconds)+" s depuis position" : "Âge inconnu"}</span>
              </div>
            </section>
            <div className="tv-v5-secondary-row">
              {[1,2].map((index)=>{
                const item=traffic[index]; const info=item ? enriched[item.id.replace(/^~/,"").toUpperCase()] : null;
                return <article key={index} className={"tv-v5-secondary tv-v5-secondary-"+(index+1)} aria-label={"Avion numéro "+(index+1)}>
                  <div className="tv-v5-secondary-head">
                    <span className={"tv-v5-rank rank"+(index+1)}>{index+1}</span>
                    <AircraftVisual info={info} className="tv-v5-photo-secondary" />
                    <div><strong>{info?.flightNumberIata || item?.callsign || item?.registration || "AVION "+(index+1)}</strong>
                    <small>{info?.aircraftModel || item?.description || item?.aircraftType || "EN ATTENTE DE PASSAGE"}</small>
                    <span>{info?.operator || item?.operator || (item ? "Opérateur inconnu" : "Aucun signal")}</span></div>
                  </div>
                  <p>{item ? airportCity(info?.departureAirport) + " → " + airportCity(info?.arrivalAirport) : "DÉPART — · ARRIVÉE —"}</p>
                  <div className="tv-v5-secondary-metrics">
                    <span>{item ? formatNumber(item.barometricAltitude," m") : "—"}</span>
                    <span>{item?.velocity != null ? formatNumber(item.velocity*3.6," km/h") : "—"}</span>
                    <span>{item ? item.distance.toFixed(1)+" km" : "—"}</span>
                  </div>
                  <small className="tv-v5-secondary-bottom">CAP : {capFrancais(item?.trueTrack)} · {item?.feedSource || "ADS-B en attente"}
                    {info ? " · " + (info.photo.kind === "exact" ? "Photo référencée" : "Visuel illustratif") : ""}</small>
                </article>;
              })}
            </div>
          </>}

          <div className="tv-v5-alert-row">
            <section className={"tv-v5-priority-status"+(priorityTakeover ? " is-active" : "")}>
              <div className="tv-v5-alert-head"><span>✚</span><strong>MOYENS PRIORITAIRES</strong></div>
              <b>{feedFresh && nearbyAlert ? (nearbyAlert.priority+" · "+(nearbyAlert.item.callsign || nearbyAlert.item.registration || nearbyAlert.item.id)) : feedFresh ? "Aucun moyen identifié à proximité" : "Radar en attente"}</b>
              <small>Secours <i className="tv-v5-dot tv-v5-dot-red" /> · Armée <i className="tv-v5-dot tv-v5-dot-gold" /> · Rayon 20 km</small>
              <small>{lastPriority ? "Dernière détection : "+alertDate(lastPriority.detectedAt) : "Aucune détection enregistrée depuis l'ouverture"}</small>
            </section>
            <section className={"tv-v5-emergency-status"+(emergencyFlash||newsFlash ? " is-active" : "")} aria-live="polite">
              <div className="tv-v5-alert-head"><span>⚠</span><strong>SURVEILLANCE DES URGENCES</strong></div>
              <b>{activeEmergency ? "URGENCE ADS-B ACTIVE" : "DERNIÈRE URGENCE CONNUE"}</b>
              <p>{alertName}</p>
              <small>{alertSource}</small>
              <small>Date / heure : {alertDate(alertTimestamp)} · Lieu : non confirmé</small>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
