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
const SHOWCASE_DISTANCE_KM = 12;
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
const TECHNICAL_REPORT = /panne|avarie|probl[eè]me technique|incident technique|pressurisation|d[eé]pressurisation|panne moteur/i;
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
    if (key && key !== seenEmergency.current && emergency) {
      seenEmergency.current = key;
      setLastEmergency({
        key, aircraft: emergency.callsign || emergency.registration || emergency.id,
        code: emergency.squawk ?? "", detectedAt: new Date().toISOString()
      });
    }
    if (!key) seenEmergency.current = null;
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
        color: priority ? "#ffce46" : "#138ad0",
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
    .find(({ item, priority }) => priority !== null && (item.positionAgeSeconds ?? 0) < 90) ?? null, [traffic, enriched]);

  useEffect(() => {
    if (!feedFresh) return;
    const key = nearbyAlert ? nearbyAlert.item.id + "-" + nearbyAlert.priority : null;
    if (key && key !== seenPriority.current && nearbyAlert) {
      seenPriority.current = key;
      setLastPriority({
        key, label: nearbyAlert.priority || "MOYEN PRIORITAIRE",
        aircraft: nearbyAlert.item.callsign || nearbyAlert.item.registration || nearbyAlert.item.id,
        detectedAt: new Date().toISOString()
      });
    }
    if (!key) seenPriority.current = null;
  }, [nearbyAlert, feedFresh]);

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
      .catch(() => { if (mediaRequest.current === requestId && !controller.signal.aborted) setMediaStatus("empty"); });
    return () => controller.abort();
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

  const clock = now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const activeEmergency = feedFresh ? traffic.find((item) =>
    EMERGENCY_CODES.includes(item.squawk ?? "") && (item.positionAgeSeconds ?? 0) < 90) : null;
  const latestTechnicalArticle = news.filter((item) => TECHNICAL_REPORT.test(item.title))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;
  // Une urgence ADS-B active reste affichée ; ne jamais la masquer
  // pendant l'alternance des anciennes dépêches de presse.
  const showEmergency = Boolean(activeEmergency);
  const displayLatest = !showEmergency && latestTechnicalArticle;
  const showFlight = Boolean(candidate && destination);
  const nearFlightName = candidate?.details?.flightNumberIata || candidate?.details?.callsignIcao || candidate?.item.callsign || "VOL IDENTIFIÉ";

  const first = traffic[0] ?? null;
  const firstInfo = first ? enriched[first.id.replace(/^~/, "").toUpperCase()] : null;
  const firstDeparture = firstInfo?.departureAirport ? code(firstInfo.departureAirport) : "—";
  const firstArrival = firstInfo?.arrivalAirport ? code(firstInfo.arrivalAirport) : "—";
  const firstDepartureCity = airportCity(firstInfo?.departureAirport);
  const firstArrivalCity = airportCity(firstInfo?.arrivalAirport);

  return (
    <main className="xavpac-tv tv-v4" aria-label="XavPac TV — proposition 4 en service, sans musique et sans commande">
      <header className="tv-topbar tv-v4-header">
        <div className="tv-brand">
          <span className="tv-brand-symbol">✈</span>
          <div><strong>XAVPAC <em>TV</em> · SKY SHOW</strong><small>CARTE AÉRIENNE · BÂGÉ-DOMMARTIN</small></div>
        </div>
        <div className="tv-livebar">
          <span className="tv-signal"><i /> {feedFresh ? "RADAR EN DIRECT" : connection}</span>
          <span className="tv-utc">{clock}</span>
        </div>
      </header>
      <section className="tv-v4-layout" aria-label="Carte et télévision immersive">
        <div className="tv-v4-map">
          <div className="tv-map-static">
            <StableMap points={mapPoints} center={HOME} radiusKm={RADIUS_KM}
              showRadius mapVariant="street" controls={false} zoom={9}
              selectedId={first?.id ?? null} />
          </div>
          <div className="tv-map-shine" aria-hidden="true" />
          <div className="tv-v4-map-note">
            <b>✈ {traffic.length} AÉRONEF{traffic.length > 1 ? "S" : ""}</b> · 50 KM ·
            {updatedAt ? " " + alertDate(updatedAt) : " EN ATTENTE DES POSITIONS"}
          </div>
        </div>

        <aside className="tv-v4-sidebar" aria-label="Informations aéronautiques et vidéo">
          <article className="tv-v4-hero">
            <div className="tv-v4-hero-heading">
              <span className="tv-v4-number tv-v4-number-1">1</span>
              <div className="tv-v4-hero-title">
                <strong>{firstInfo?.flightNumberIata || first?.callsign || first?.registration || "AVION N° 1 EN ATTENTE"}</strong>
                <small>{firstInfo?.aircraftModel || firstInfo?.aircraftType || first?.description || first?.aircraftType || "TYPE NON IDENTIFIÉ"}</small>
              </div>
              <span className="tv-v4-hero-rank">N° 1 · CARTE</span>
            </div>
            <div className="tv-v4-hero-route">
              <b>{firstDepartureCity} ({firstDeparture})</b><span>➜</span><b>{firstArrivalCity} ({firstArrival})</b>
              <small>{firstInfo?.operator || first?.operator || "Compagnie non identifiée"}</small>
            </div>
            <div className="tv-v4-metrics">
              <div><small>ALTITUDE</small><strong>{first ? formatNumber(first.barometricAltitude, " m") : "—"}</strong></div>
              <div><small>VITESSE SOL</small><strong>{first?.velocity != null ? formatNumber(first.velocity * 3.6, " km/h") : "—"}</strong></div>
              <div><small>CAP</small><strong>{capFrancais(first?.trueTrack)}</strong><span className="tv-v4-cap-degrees">{first?.trueTrack != null ? formatNumber(first.trueTrack, "°") : ""}</span></div>
              <div><small>DISTANCE HOME</small><strong>{first ? first.distance.toFixed(1) + " km" : "—"}</strong></div>
            </div>
            <div className="tv-v4-route-note">
              {firstInfo?.routeConfidence === "confirmed" ? "TRAJET CONFIRMÉ" : "TRAJET DISPONIBLE SELON SOURCES · NON CONFIRMÉ"}
              <span>Positions ADS-B réelles · actualisation automatique</span>
            </div>
          </article>

          <section className="tv-v4-video" aria-label="Grande vidéo immersive automatique">
            <div className="tv-v4-video-heading">
              <strong>▣ VUE IMMERSIVE · VIDÉO</strong>
              <span>{showFlight ? city + " · " + code(destination) : "PROCHAINE ESCALE"}</span>
            </div>
            <div className="tv-media-screen tv-v4-video-screen">
              {showFlight && activeMedia?.type === "video" && <video
                key={activeMedia.url}
                ref={videoRef} className="tv-destination-video"
                src={activeMedia.url} autoPlay muted playsInline preload="auto"
                poster={activeMedia.preview || undefined}
                onCanPlay={() => { const video = videoRef.current; if (video) void video.play().catch(() => {}); }}
                onError={() => setBadMedia((previous) => previous.includes(activeMedia.url) ? previous : [...previous, activeMedia.url])}
                onEnded={() => setMediaIndex((index) => index + 1)}
              />}
              {showFlight && activeMedia?.type === "image" && <div key={activeMedia.url}
                className="tv-destination-image" style={{ backgroundImage: "url(" + JSON.stringify(activeMedia.url) + ")" }} />}
              {(!showFlight || !activeMedia) && <div className="tv-mood-illustration">
                <div className="tv-mood-orbit one" /><div className="tv-mood-orbit two" />
                <span className="tv-mood-plane">✈</span>
              </div>}
              <div className="tv-media-gradient" />
              <div className="tv-v4-video-caption">
                <b>{showFlight ? city : "Prochaine escale…"}</b>
                <small>{showFlight ? activeMedia?.type === "video" ? "FILM EN LECTURE AUTOMATIQUE · SANS SON"
                  : "DIAPORAMA · VIDÉO DÈS DISPONIBILITÉ"
                  : "VIDÉO DÈS QU’UN VOL PROCHE EST IDENTIFIÉ"}</small>
              </div>
            </div>
            <div className="tv-v4-media-source">
              {showFlight && activeMedia ? "Source : " + activeMedia.sourceName
                + (activeMedia.author ? " · " + activeMedia.author : "")
                : mediaStatus === "loading" ? "Recherche des images de l'escale…" : "Aucun film disponible actuellement"}
            </div>
          </section>

          <div className="tv-v4-secondary" aria-label="Avions 2 et 3 concordants avec la carte">
            {[1,2].map((index) => {
              const item = traffic[index];
              const info = item ? enriched[item.id.replace(/^~/, "").toUpperCase()] : null;
              return <article key={index} className={"tv-v4-second-card tv-v4-second-" + (index + 1)}>
                <span className={"tv-v4-number tv-v4-number-" + (index + 1)}>{index + 1}</span>
                {item ? <div className="tv-v4-second-body">
                  <strong>{info?.flightNumberIata || item.callsign || item.registration || "ADS-B"}</strong>
                  <small>{info?.aircraftModel || info?.aircraftType || item.aircraftType || "Type non identifié"}</small>
                  <div className="tv-v4-second-route">{info?.departureAirport && info?.arrivalAirport
                    ? airportCity(info.departureAirport) + " → " + airportCity(info.arrivalAirport)
                    : "VILLES NON RENSEIGNÉES"}</div>
                  <div className="tv-v4-second-stats">
                    <span>{formatNumber(item.barometricAltitude, " m")}</span>
                    <span>{item.velocity != null ? formatNumber(item.velocity * 3.6, " km/h") : "—"}</span>
                    <span>{item.distance.toFixed(1)} km</span>
                    <span>Cap : {capFrancais(item.trueTrack)}</span>
                  </div>
                </div> : <div className="tv-v4-second-body"><strong>AVION {index + 1}</strong><small>En attente de trafic ADS-B</small><div className="tv-v4-second-route">Départ — · Arrivée —</div><div className="tv-v4-second-stats"><span>Cap : —</span></div></div>}
              </article>;
            })}
          </div>

          <div className="tv-v4-alerts">
            <div className={"tv-status-priority" + (feedFresh && nearbyAlert ? " is-active" : "")} role="status">
              <span>🚁</span><div><b>MOYENS PRIORITAIRES</b>
                <strong>{feedFresh && nearbyAlert ? nearbyAlert.priority + " · " + (nearbyAlert.item.callsign || nearbyAlert.item.registration || "AÉRONEF")
                  : feedFresh ? "Aucun moyen identifié" : "Radar non actualisé"}</strong>
                <small>{feedFresh && nearbyAlert && lastPriority?.key === nearbyAlert.item.id + "-" + nearbyAlert.priority
                  ? "Détecté le " + alertDate(lastPriority.detectedAt) : "Sécurité civile / Armée · détection partielle"}</small>
              </div>
            </div>
            <div className={"tv-incident-card" + (showEmergency ? " is-live" : "")} role="status" aria-live="polite">
              <span className="tv-incident-icon">{showEmergency ? "🚨" : "⚠"}</span>
              <div><b>{showEmergency ? "URGENCE EN TEMPS RÉEL" : displayLatest ? "DERNIÈRE PANNE SIGNALÉE · PRESSE" : "VEILLE DES URGENCES"}</b>
                <strong>{showEmergency && activeEmergency ? incidentLabel(activeEmergency.squawk ?? "")
                  : displayLatest ? displayLatest.title
                  : lastEmergency ? incidentLabel(lastEmergency.code) : "Aucun incident connu dans les données"}</strong>
                <small>{showEmergency && activeEmergency ? (activeEmergency.callsign || activeEmergency.id)
                    + " · détecté le " + alertDate(lastEmergency?.key === activeEmergency.id + "-" + activeEmergency.squawk
                      ? lastEmergency.detectedAt : updatedAt)
                  : displayLatest ? displayLatest.source + " · " + alertDate(displayLatest.date)
                  : lastEmergency ? "ADS-B · détecté le " + alertDate(lastEmergency.detectedAt)
                  : "ADS-B · couverture non exhaustive"}</small>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
