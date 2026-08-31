"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { XAVPAC_HOME } from "../config/home";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { describeDfciCode, recognizeDfciCodes } from "../lib/fire/dfci";
import { distanceBetweenKm, type FirmsFeed } from "../lib/fire/firms";
import {
  isSitacPointArray,
  SITAC_CATEGORIES,
  SITAC_CATEGORY_DETAILS,
  type SitacCategory,
  type SitacPoint
} from "../lib/fire/sitac";
import { detectReferenceDevice, resolveReference, type ReferenceDevice, type ReferenceGpsFix, type ReferencePreference } from "../lib/referenceResolver";
import { getBrowserStorage, safeReadJson, safeWriteJson, XAVPAC_STORAGE_KEYS } from "../lib/safeStorage";
import type { MapPoint, MapWmsOverlay } from "./StableMap";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });
const IGN_WMS_URL = "https://data.geopf.fr/wms-r/wms";

type MapAction = "explore" | "mission" | "sitac";

function ageLabel(iso: string) {
  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(ageMinutes)) return "âge inconnu";
  if (ageMinutes < 1) return "à l’instant";
  if (ageMinutes < 60) return `il y a ${ageMinutes} min`;
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  return `il y a ${hours} h${minutes ? ` ${minutes}` : ""}`;
}

function referenceLabel(preference: ReferencePreference, actualKind: string) {
  if (preference === "auto") return actualKind === "moi" ? "Auto · MOI GPS" : "Auto · HOME";
  if (preference === "moi") return "MOI GPS";
  if (preference === "mission") return "MISSION";
  return "HOME";
}

function makeSitacId() {
  try { return crypto.randomUUID(); } catch { return `sitac-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export default function FireRiskPanel() {
  const {
    position,
    accuracy,
    timestamp,
    quality,
    usableForPreciseCalculations,
    status: gpsStatus,
    retryGeolocation
  } = useLiveGeolocation();
  const [device, setDevice] = useState<ReferenceDevice>("desktop");
  const [referencePreference, setReferencePreference] = useState<ReferencePreference>("auto");
  const [missionPoint, setMissionPoint] = useState<[number, number] | null>(null);
  const [mapAction, setMapAction] = useState<MapAction>("explore");
  const [mapStyle, setMapStyle] = useState<"street" | "satellite" | "dark">("satellite");
  const [showForestAccess, setShowForestAccess] = useState(false);
  const [showDfciGrid, setShowDfciGrid] = useState(true);
  const [radiusKm, setRadiusKm] = useState(50);
  const [firmsFeed, setFirmsFeed] = useState<FirmsFeed | null>(null);
  const [firmsLoading, setFirmsLoading] = useState(false);
  const [firmsRefresh, setFirmsRefresh] = useState(0);
  const [dfciText, setDfciText] = useState("");
  const [sitacCategory, setSitacCategory] = useState<SitacCategory>("incident");
  const [sitacLabel, setSitacLabel] = useState("");
  const [sitacPoints, setSitacPoints] = useState<SitacPoint[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const lastValidGpsRef = useRef<ReferenceGpsFix | null>(null);

  useEffect(() => {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setDevice(detectReferenceDevice({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      coarsePointer
    }));
    setSitacPoints(safeReadJson(getBrowserStorage("local"), XAVPAC_STORAGE_KEYS.fireSitac, isSitacPointArray, []));
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    safeWriteJson(getBrowserStorage("local"), XAVPAC_STORAGE_KEYS.fireSitac, sitacPoints);
  }, [sitacPoints, storageReady]);

  const gpsFix: ReferenceGpsFix | null = position ? {
    position,
    accuracyMeters: accuracy,
    timestampMs: timestamp,
    quality,
    usable: usableForPreciseCalculations
  } : null;
  if (gpsFix?.usable) lastValidGpsRef.current = gpsFix;

  const resolvedReference = resolveReference({
    device,
    preference: referencePreference,
    explicitPosition: missionPoint,
    home: XAVPAC_HOME.position,
    gps: gpsFix,
    lastValidGps: lastValidGpsRef.current
  });
  const activePosition = resolvedReference.position ?? XAVPAC_HOME.position;
  const referenceKey = `${activePosition[0].toFixed(3)}:${activePosition[1].toFixed(3)}:${radiusKm}`;

  useEffect(() => {
    let cancelled = false;
    async function loadFirms() {
      setFirmsLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(activePosition[0]),
          lon: String(activePosition[1]),
          radiusKm: String(radiusKm)
        });
        const response = await fetch(`/api/firms?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json() as FirmsFeed;
        if (!cancelled) setFirmsFeed(payload);
      } catch {
        if (!cancelled) setFirmsFeed({
          status: "unavailable",
          source: "NASA FIRMS",
          retrievedAt: new Date().toISOString(),
          detections: [],
          message: "NASA FIRMS est momentanément inaccessible."
        });
      } finally {
        if (!cancelled) setFirmsLoading(false);
      }
    }
    loadFirms();
    return () => { cancelled = true; };
    // referenceKey stabilise les petits déplacements GPS pour ne pas solliciter inutilement FIRMS.
  }, [firmsRefresh, referenceKey]);

  const detections = useMemo(() => (firmsFeed?.detections ?? [])
    .map((detection) => ({
      ...detection,
      distanceKm: distanceBetweenKm(activePosition, [detection.latitude, detection.longitude])
    }))
    .sort((first, second) => first.distanceKm - second.distanceKm), [activePosition, firmsFeed]);
  const dfciMatches = useMemo(() => recognizeDfciCodes(dfciText), [dfciText]);

  const wmsOverlays = useMemo<MapWmsOverlay[]>(() => [
    ...(showForestAccess ? [{
      id: "ign-forest-access",
      url: IGN_WMS_URL,
      layers: "IGNF_ACCESSIBILITE-PHYSIQUE-FORETS-PORTEUR",
      attribution: "IGN — Accessibilité physique des forêts",
      opacity: .66
    }] : []),
    ...(showDfciGrid ? [{
      id: "ign-dfci",
      url: IGN_WMS_URL,
      layers: "GEOGRAPHICALGRIDSYSTEM.DFCI",
      attribution: "IGN — Carroyage DFCI",
      opacity: .74
    }] : [])
  ], [showDfciGrid, showForestAccess]);

  const mapPoints = useMemo<MapPoint[]>(() => [
    {
      id: "risk-reference",
      lat: activePosition[0],
      lon: activePosition[1],
      name: resolvedReference.kind === "moi" ? "MOI" : resolvedReference.kind === "mission" ? "MISSION" : "HOME",
      detail: referenceLabel(referencePreference, resolvedReference.kind),
      category: resolvedReference.kind === "moi" ? "moi" : resolvedReference.kind === "mission" ? "mission" : "home"
    },
    ...detections.map((detection) => ({
      id: detection.id,
      lat: detection.latitude,
      lon: detection.longitude,
      name: "Détection thermique",
      detail: `${ageLabel(detection.acquiredAt)} • ${detection.frpMw === null ? "FRP non disponible" : `${detection.frpMw} MW`} • ${detection.distanceKm.toFixed(1)} km`,
      category: "hotspot",
      color: detection.frpMw !== null && detection.frpMw >= 50 ? "#ff3b40" : "#ff7a45"
    })),
    ...sitacPoints.map((point) => ({
      id: point.id,
      lat: point.position[0],
      lon: point.position[1],
      name: point.label,
      detail: SITAC_CATEGORY_DETAILS[point.category].label,
      category: `sitac-${point.category}`,
      color: SITAC_CATEGORY_DETAILS[point.category].color
    }))
  ], [activePosition, detections, referencePreference, resolvedReference.kind, sitacPoints]);

  function handleMapClick(nextPosition: [number, number]) {
    if (mapAction === "mission") {
      setMissionPoint(nextPosition);
      setReferencePreference("mission");
      setMapAction("explore");
      return;
    }
    if (mapAction !== "sitac") return;
    const categoryDetails = SITAC_CATEGORY_DETAILS[sitacCategory];
    setSitacPoints((current) => [...current, {
      id: makeSitacId(),
      category: sitacCategory,
      label: sitacLabel.trim() || categoryDetails.label,
      position: nextPosition,
      createdAt: new Date().toISOString()
    }]);
    setSitacLabel("");
  }

  function removeSitacPoint(id: string) {
    setSitacPoints((current) => current.filter((point) => point.id !== id));
  }

  return <section className="fire-risk-panel">
    <header className="fire-risk-hero">
      <div>
        <span className="fire-risk-eyebrow">Nouveau · XavPac 6.5 terrain</span>
        <h2>Feux &amp; Risques</h2>
        <p>Détections thermiques, carroyage DFCI, accessibilité forestière et annotations locales sur une seule carte.</p>
      </div>
      <div className="fire-risk-source-pills" aria-label="Sources cartographiques">
        <span><i className="live" /> NASA FIRMS</span>
        <span><i /> IGN / GéoPlateforme</span>
      </div>
    </header>

    <div className="fire-reference-bar">
      <div className="fire-reference-heading">
        <span>Référence active</span>
        <strong>{referenceLabel(referencePreference, resolvedReference.kind)}</strong>
      </div>
      <div className="fire-reference-buttons" role="group" aria-label="Choisir la référence">
        <button type="button" className={referencePreference === "auto" ? "active" : ""} onClick={() => setReferencePreference("auto")}>AUTO</button>
        <button type="button" className={referencePreference === "moi" ? "active" : ""} onClick={() => { setReferencePreference("moi"); if (!position) retryGeolocation(); }}>MOI</button>
        <button type="button" className={referencePreference === "home" ? "active" : ""} onClick={() => setReferencePreference("home")}>HOME</button>
        <button type="button" className={referencePreference === "mission" ? "active" : ""} onClick={() => missionPoint ? setReferencePreference("mission") : setMapAction("mission")}>MISSION</button>
      </div>
      <small>{resolvedReference.kind === "moi" ? gpsStatus : `${activePosition[0].toFixed(5)}, ${activePosition[1].toFixed(5)}`}</small>
    </div>

    <div className="fire-map-stage">
      <StableMap
        points={mapPoints}
        center={activePosition}
        zoom={10}
        radiusKm={radiusKm}
        showRadius
        mapVariant={mapStyle}
        onMapClick={handleMapClick}
        wmsOverlays={wmsOverlays}
      />

      <div className="fire-map-layers">
        <strong>Couches</strong>
        <label><input type="checkbox" checked={showDfciGrid} onChange={(event) => setShowDfciGrid(event.target.checked)} /> DFCI IGN</label>
        <label><input type="checkbox" checked={showForestAccess} onChange={(event) => setShowForestAccess(event.target.checked)} /> Accès forêt</label>
        <select value={mapStyle} onChange={(event) => setMapStyle(event.target.value as typeof mapStyle)} aria-label="Fond de carte">
          <option value="satellite">Satellite</option>
          <option value="street">Plan</option>
          <option value="dark">Sombre</option>
        </select>
      </div>

      <div className="fire-map-actions" role="group" aria-label="Outils de carte">
        <button type="button" className={mapAction === "explore" ? "active" : ""} onClick={() => setMapAction("explore")}><span>✥</span> Explorer</button>
        <button type="button" className={mapAction === "mission" ? "active" : ""} onClick={() => setMapAction("mission")}><span>＋</span> Poser MISSION</button>
        <button type="button" className={mapAction === "sitac" ? "active" : ""} onClick={() => setMapAction("sitac")}><span>◆</span> Annoter</button>
      </div>

      {mapAction !== "explore" && <div className="fire-map-instruction">
        {mapAction === "mission" ? "Touchez la carte pour placer MISSION" : `Touchez la carte pour ajouter : ${SITAC_CATEGORY_DETAILS[sitacCategory].label}`}
      </div>}
    </div>

    <div className="fire-risk-grid">
      <article className="fire-card firms-card">
        <div className="fire-card-heading">
          <div><span className="fire-card-kicker">Satellite · dernières 24 h</span><h3>Points chauds FIRMS</h3></div>
          <button type="button" className="fire-refresh" disabled={firmsLoading} onClick={() => setFirmsRefresh((value) => value + 1)}>{firmsLoading ? "Actualisation…" : "Actualiser"}</button>
        </div>
        <div className="firms-summary">
          <strong>{firmsLoading && !firmsFeed ? "—" : detections.length}</strong>
          <span>détection{detections.length === 1 ? "" : "s"} thermique{detections.length === 1 ? "" : "s"} dans un rayon de</span>
          <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} aria-label="Rayon FIRMS">
            <option value={20}>20 km</option><option value={50}>50 km</option><option value={100}>100 km</option><option value={200}>200 km</option>
          </select>
        </div>
        <p className={firmsFeed?.status === "unavailable" ? "fire-source-message unavailable" : "fire-source-message"}>{firmsLoading ? "Interrogation de NASA FIRMS…" : firmsFeed?.message ?? "Préparation de NASA FIRMS…"}</p>
        {detections.length > 0 && <div className="firms-list">
          {detections.slice(0, 6).map((detection) => <div key={detection.id}>
            <span className="firms-flame">🔥</span>
            <span><strong>{detection.distanceKm.toFixed(1)} km</strong><small>{ageLabel(detection.acquiredAt)} · {detection.satellite} / {detection.instrument}</small></span>
            <b>{detection.frpMw === null ? "— MW" : `${detection.frpMw} MW`}</b>
          </div>)}
        </div>}
        <div className="fire-honesty-note"><strong>À retenir</strong><span>Un point FIRMS est une détection thermique satellite, jamais la confirmation automatique d’un feu.</span></div>
        <a className="fire-official-link" href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noreferrer">Ouvrir la carte officielle NASA FIRMS ↗</a>
      </article>

      <article className="fire-card dfci-card">
        <div className="fire-card-heading"><div><span className="fire-card-kicker">Reconnaissance locale</span><h3>Lecteur DFCI</h3></div><span className="fire-card-icon">⌗</span></div>
        <label className="fire-field-label" htmlFor="dfci-message">Collez un message ou saisissez un code</label>
        <textarea id="dfci-message" value={dfciText} onChange={(event) => setDfciText(event.target.value)} placeholder="Ex. Départ vers DFCI KD 58 A 8…" rows={4} />
        {!dfciText.trim() && <p className="dfci-placeholder">XavPac repère automatiquement les codes sans transmettre le message.</p>}
        {dfciText.trim() && dfciMatches.length === 0 && <p className="dfci-placeholder warning">Aucun format DFCI reconnu dans ce texte.</p>}
        {dfciMatches.map((code) => <div className="dfci-result" key={code.normalized}>
          <span>Code reconnu</span><strong>{code.normalized}</strong><small>{describeDfciCode(code)}</small>
        </div>)}
        <button type="button" className={showDfciGrid ? "fire-layer-button active" : "fire-layer-button"} onClick={() => setShowDfciGrid((value) => !value)}>{showDfciGrid ? "✓ Carroyage IGN visible" : "Afficher le carroyage IGN"}</button>
        <p className="fire-precision-note">La conversion précise en coordonnées s’appuie sur le carroyage officiel affiché sur la carte ; XavPac n’invente pas de position GPS à partir du seul texte.</p>
      </article>

      <article className="fire-card sitac-card">
        <div className="fire-card-heading"><div><span className="fire-card-kicker">Personnel · enregistré sur cet appareil</span><h3>SITAC légère</h3></div><span className="sitac-count">{sitacPoints.length}</span></div>
        <div className="sitac-form">
          <select value={sitacCategory} onChange={(event) => setSitacCategory(event.target.value as SitacCategory)} aria-label="Type d’annotation">
            {SITAC_CATEGORIES.map((category) => <option key={category} value={category}>{SITAC_CATEGORY_DETAILS[category].icon} {SITAC_CATEGORY_DETAILS[category].label}</option>)}
          </select>
          <input value={sitacLabel} onChange={(event) => setSitacLabel(event.target.value)} maxLength={120} placeholder="Nom facultatif" />
          <button type="button" className={mapAction === "sitac" ? "active" : ""} onClick={() => setMapAction("sitac")}>{mapAction === "sitac" ? "Touchez maintenant la carte" : "Placer sur la carte"}</button>
        </div>
        <div className="sitac-list">
          {sitacPoints.length === 0 && <p>Aucune annotation. Choisissez un symbole puis touchez la carte.</p>}
          {[...sitacPoints].reverse().slice(0, 8).map((point) => <div key={point.id}>
            <i style={{ color: SITAC_CATEGORY_DETAILS[point.category].color }}>{SITAC_CATEGORY_DETAILS[point.category].icon}</i>
            <span><strong>{point.label}</strong><small>{SITAC_CATEGORY_DETAILS[point.category].label} · {point.position[0].toFixed(5)}, {point.position[1].toFixed(5)}</small></span>
            <button type="button" onClick={() => removeSitacPoint(point.id)} aria-label={`Supprimer ${point.label}`}>×</button>
          </div>)}
        </div>
      </article>

      <article className="fire-card forest-card">
        <div className="fire-card-heading"><div><span className="fire-card-kicker">Couche officielle IGN</span><h3>Accessibilité en forêt</h3></div><span className="fire-card-icon">♣</span></div>
        <p>Lecture de l’accessibilité physique modélisée par l’IGN pour les engins porteurs. Cette donnée aide à préparer une reconnaissance, mais ne garantit jamais qu’un accès est praticable le jour de l’intervention.</p>
        <button type="button" className={showForestAccess ? "fire-layer-button forest active" : "fire-layer-button forest"} onClick={() => setShowForestAccess((value) => !value)}>{showForestAccess ? "✓ Couche visible sur la carte" : "Afficher l’accessibilité forestière"}</button>
        <div className="forest-source"><span>Source</span><strong>IGN · GéoPlateforme WMS</strong><small>IGNF_ACCESSIBILITE-PHYSIQUE-FORETS-PORTEUR</small></div>
      </article>
    </div>
  </section>;
}
