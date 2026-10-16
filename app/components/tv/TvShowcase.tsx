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
const RADIUS_KM = 50;
const SHOWCASE_DISTANCE_KM = 12;
const HOME = XAVPAC_HOME.position;

type TrackedAircraft = LiveAircraft & { distance: number };
type DestinationMedia = { id: string; type: "video" | "image"; url: string; preview: string | null; sourceName: string; author: string | null };
type MediaPayload = { items?: DestinationMedia[]; provider?: string };
type EnrichmentPayload = { enriched?: EnrichedAircraft[] };
type TrafficPayload = { aircraft?: LiveAircraft[]; fetchedAt?: string; source?: string };

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
  const enrichTime = useRef(0);
  const mediaRequest = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const mapPoints = useMemo<MapPoint[]>(() => [
    { id: "home-tv", lat: HOME[0], lon: HOME[1], name: "HOME", category: "home", detail: "Bâgé-Dommartin" },
    ...traffic.map((item) => {
      const details = enriched[item.id.replace(/^~/, "").toUpperCase()];
      const priority = specialLabel(item, details);
      const route = details?.departureAirport && details?.arrivalAirport
        ? code(details.departureAirport) + " → " + code(details.arrivalAirport)
        : details?.flightNumberIata || item.callsign || "ADS-B";
      const helicopter = aircraftGlyph(item, details) === "🚁";
      return {
        id: item.id, lat: item.latitude, lon: item.longitude, name: route,
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
    .find(({ priority }) => priority !== null) ?? null, [traffic, enriched]);

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
  }, [destinationKey, city, destination?.iata]);

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
    void video.play().catch(() => { /* Le navigateur peut limiter la lecture même en mode muet. */ });
  }, [activeMedia]);

  const clock = now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const showFlight = Boolean(candidate && destination);
  const nearFlightName = candidate?.details?.flightNumberIata || candidate?.details?.callsignIcao || candidate?.item.callsign || "VOL IDENTIFIÉ";

  return (
    <main className="xavpac-tv" aria-label="XavPac TV — écran de présentation automatique">
      <div className="tv-ambient tv-ambient-a" aria-hidden="true" />
      <div className="tv-ambient tv-ambient-b" aria-hidden="true" />
      <header className="tv-topbar">
        <div className="tv-brand"><span className="tv-brand-symbol">✦</span><div><strong>XAVPAC <em>TV</em></strong><small>LE CIEL EN DIRECT • BÂGÉ-DOMMARTIN</small></div></div>
        <div className="tv-livebar"><span className="tv-signal"><i /> {connection}</span><span className="tv-utc">{clock}</span></div>
      </header>

      {nearbyAlert && <div className="tv-priority-alert" role="status">
        <span className="tv-alert-icon">{aircraftGlyph(nearbyAlert.item)}</span>
        <strong>TRAFIC PRIORITAIRE · {nearbyAlert.priority}</strong>
        <span>{nearbyAlert.item.callsign || nearbyAlert.item.registration || "AÉRONEF"} · {nearbyAlert.item.distance.toFixed(1)} KM DE HOME</span>
        <i className="tv-alert-light" />
      </div>}

      <section className="tv-main">
        <div className="tv-map-panel">
          <div className="tv-panel-head"><div><span className="tv-eyebrow">SURVEILLANCE DU CIEL</span><h1>Le ballet des aéronefs <span>✦</span></h1></div><div className="tv-flight-count"><b>{traffic.length}</b><small>EN VOL · 50 KM</small></div></div>
          <div className="tv-map-wrap">
            <div className="tv-map-static">
              <StableMap points={mapPoints} center={HOME} radiusKm={RADIUS_KM} showRadius mapVariant="street" controls={false} zoom={9} selectedId={candidate?.item.id ?? null} />
            </div>
            <div className="tv-map-shine" aria-hidden="true" />
            <div className="tv-map-label"><i /> ZONE DE SURVEILLANCE FIXE <b>50 KM</b></div>
            <div className="tv-map-corner">⌖ HOME · BÂGÉ-DOMMARTIN</div>
          </div>
          <div className="tv-map-footer"><span><i className="tv-pulse-dot" /> Actualisation automatique</span><span>{updatedAt ? "Dernière position : " + new Date(updatedAt).toLocaleTimeString("fr-FR") : "Recherche des aéronefs..."}</span><span>ADS-B · sans interaction</span></div>
        </div>

        <div className="tv-destination-panel">
          <div className="tv-media-head"><span className="tv-eyebrow">✦ ESCALE IMMERSIVE</span><span className="tv-media-state">{showFlight ? "PASSAGE À PROXIMITÉ" : "EN ATTENTE D'UN PASSAGE"}</span></div>
          <div className="tv-media-screen">
            {showFlight && activeMedia?.type === "video" && <video
              key={activeMedia.url}
              ref={videoRef}
              className="tv-destination-video"
              src={activeMedia.url}
              autoPlay
              muted
              playsInline
              preload="auto"
              poster={activeMedia.preview || undefined}
              onCanPlay={() => { const video = videoRef.current; if (video) void video.play().catch(() => {}); }}
              onError={() => setBadMedia((previous) => previous.includes(activeMedia.url) ? previous : [...previous, activeMedia.url])}
              onEnded={() => setMediaIndex((index) => index + 1)}
            />}
            {showFlight && activeMedia?.type === "image" && <div key={activeMedia.url} className="tv-destination-image" style={{ backgroundImage: "url(" + JSON.stringify(activeMedia.url) + ")" }} />}
            {(!showFlight || !activeMedia) && <div className="tv-mood-illustration"><div className="tv-mood-orbit one" /><div className="tv-mood-orbit two" /><div className="tv-mood-orbit three" /><span className="tv-mood-plane">✈</span><span className="tv-mood-stars">✦ ✧ ⋆</span></div>}
            <div className="tv-media-gradient" />
            <div className="tv-city-caption">
              <span>{showFlight ? "BIENVENUE À DESTINATION" : "LE MONDE DÉFILE AU-DESSUS DE NOUS"}</span>
              <h2>{showFlight ? city : "Prochaine escale..."}</h2>
              <p>{showFlight ? nearFlightName + " • " + code(destination) : "La prochaine vidéo démarre automatiquement à l'arrivée d'un vol identifié près de HOME."}</p>
            </div>
          </div>
          <div className="tv-story-strip">
            <div><small>VOL EN VEDETTE</small><strong>{featured ? aircraftGlyph(featured, featuredInfo) + " " + (featuredInfo?.flightNumberIata || featured.callsign) : "✈ RADAR ACTIF"}</strong></div>
            <div><small>DISTANCE</small><strong>{featured ? featured.distance.toFixed(1) + " km" : "—"}</strong></div>
            <div><small>ALTITUDE</small><strong>{featured ? formatNumber(featured.barometricAltitude, " m") : "—"}</strong></div>
          </div>
          <div className="tv-media-credit">{showFlight && activeMedia ? "Images : " + activeMedia.sourceName + (activeMedia.author ? " · " + activeMedia.author : "") : mediaStatus === "loading" ? "Recherche de la ville d'arrivée..." : "Sélection automatique · aucune commande nécessaire"}</div>
        </div>
      </section>

      <section className="tv-bottom">
        <div className="tv-bottom-intro"><span className="tv-eyebrow">✦ LES PROCHAINS DANS LE CIEL</span><strong>Le spectacle continue</strong></div>
        <div className="tv-flight-cards">{traffic.slice(0, 3).map((item, index) => {
          const info = enriched[item.id.replace(/^~/, "").toUpperCase()];
          const priority = specialLabel(item, info);
          return <article key={item.id} className={"tv-flight-card" + (priority ? " tv-special" : "")}>
            <div className="tv-flight-card-index">0{index + 1}</div>
            <span className="tv-flight-card-glyph">{aircraftGlyph(item, info)}</span>
            <div className="tv-flight-card-main"><small>{priority || info?.operator || item.operator || "TRAFIC AÉRIEN"}</small><strong>{info?.flightNumberIata || item.callsign || item.registration || "ADS-B"}</strong><span>{info?.departureAirport && info?.arrivalAirport ? code(info.departureAirport) + " → " + code(info.arrivalAirport) : info?.aircraftType || item.aircraftType || "Trajet en cours d'identification"}</span></div>
            <div className="tv-flight-card-distance">{item.distance.toFixed(1)} <small>KM</small></div>
          </article>;
        })}{!traffic.length && <div className="tv-empty-cards">Le radar est à l&apos;écoute… les prochains aéronefs apparaîtront ici automatiquement.</div>}</div>
      </section>
      <footer className="tv-footer"><span>✦ XAVPAC TV · LE MONDE VU DU CIEL</span><span>Destination affichée uniquement lorsqu&apos;elle est identifiée · photographies et vidéos selon disponibilité</span></footer>
    </main>
  );
}
