"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { reportDataUpdate } from "../lib/buildInfo";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type NationalAsset = {
  id: string;
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  track: number | null;
  registration: string | null;
  aircraftType: string | null;
  description: string | null;
  operator: string | null;
  onGround: boolean;
  lastSeenSeconds: number | null;
  identification: {
    category: string;
    badge: string;
    model: string | null;
    operator: string | null;
    probableMission: string | null;
    confidence: "confirmed" | "probable" | "to-confirm";
    evidence: string[];
  };
};

type MapStyle = "street" | "satellite" | "dark";
type ExactPhoto = { image: string; link: string | null; photographer: string | null };
type NationalVisualKind = "water-bomber" | "turboprop" | "helicopter" | "medical" | "military" | "surveillance" | "drone" | "civil-security" | "specialized";

function markerCategory(asset: NationalAsset) {
  const badge = asset.identification.badge;
  if (badge.includes("CANADAIR")) return "national-canadair";
  if (badge.includes("DASH")) return "national-dash";
  if (badge.includes("DRAGON")) return "national-dragon";
  if (badge.includes("GENDARMERIE")) return "national-gendarmerie";
  if (badge.includes("SAMU")) return "national-samu";
  if (badge.includes("BEECHCRAFT")) return "national-beechcraft";
  if (badge.includes("MILITAIRE")) return "national-military";
  if (badge.includes("DOUANE")) return "national-customs";
  if (badge.includes("DRONE")) return "national-drone";
  return "national-unknown";
}

function nationalVisual(asset: NationalAsset): { kind: NationalVisualKind; label: string } {
  const badge = asset.identification.badge;
  if (badge.includes("CANADAIR")) return { kind: "water-bomber", label: "Avion bombardier d’eau" };
  if (badge.includes("DASH")) return { kind: "turboprop", label: "Avion de sécurité civile turbopropulsé" };
  if (badge.includes("SAMU")) return { kind: "medical", label: "Hélicoptère médical" };
  if (badge.includes("DRAGON") || badge.includes("GENDARMERIE") || isHelicopter(asset)) return { kind: "helicopter", label: "Hélicoptère de service public" };
  if (badge.includes("MILITAIRE")) return { kind: "military", label: "Aéronef militaire" };
  if (badge.includes("DOUANE") || badge.includes("BEECHCRAFT")) return { kind: "surveillance", label: "Aéronef spécialisé de surveillance" };
  if (badge.includes("DRONE")) return { kind: "drone", label: "Drone opérationnel" };
  if (badge.includes("SÉCURITÉ CIVILE")) return { kind: "civil-security", label: "Moyen de la Sécurité civile" };
  return { kind: "specialized", label: "Aéronef spécialisé" };
}

function NationalAssetPictogram({ asset, compact = false }: { asset: NationalAsset; compact?: boolean }) {
  const visual = nationalVisual(asset);
  return <div className={`national-generic-visual ${visual.kind}${compact ? " compact" : ""}`} role="img" aria-label={`${visual.label} — illustration générique`}>
    <svg viewBox="0 0 160 100" aria-hidden="true">
      {visual.kind === "water-bomber" && <><path d="M16 52 64 44 75 15h10l10 29 49 8-4 13-45-3-8 25H73l-8-25-45 3Z" /><path className="accent" d="M61 72c0 7-5 11-10 11s-10-4-10-11c0-5 10-17 10-17s10 12 10 17Zm58 0c0 7-5 11-10 11s-10-4-10-11c0-5 10-17 10-17s10 12 10 17Z" /></>}
      {visual.kind === "turboprop" && <><path d="M18 53 67 45 76 19h8l9 26 49 8-4 11-44-2-8 24H74l-8-24-44 2Z" /><circle className="accent-outline" cx="48" cy="53" r="13" /><circle className="accent-outline" cx="112" cy="53" r="13" /></>}
      {(visual.kind === "helicopter" || visual.kind === "medical") && <><path d="M38 54c0-17 12-28 32-28h24c18 0 29 12 29 27v9H56c-10 0-18-2-18-8Zm84-2 28-12v8l-27 17ZM65 66h45l-8 10H73Z" /><path className="outline" d="M30 20h104M81 20V9M46 79h72" />{visual.kind === "medical" && <path className="accent" d="M75 34h12v8h8v12h-8v8H75v-8h-8V42h8Z" />}</>}
      {visual.kind === "military" && <path d="M80 10 96 43l48 18-5 13-45-8-8 23H74l-8-23-45 8-5-13 48-18Z" />}
      {visual.kind === "surveillance" && <><path d="M18 55 68 45 76 19h8l9 26 49 10-5 11-43-3-8 23H74l-8-23-43 3Z" /><path className="accent-outline" d="M104 28c12 3 21 11 25 22M110 16c17 5 31 17 36 33" /></>}
      {visual.kind === "drone" && <><path d="M64 43h32l9 20H55Z" /><path className="outline" d="m64 48-29-18m61 18 29-18M64 55 35 74m61-19 29 19" /><circle className="accent-outline" cx="30" cy="27" r="15" /><circle className="accent-outline" cx="130" cy="27" r="15" /><circle className="accent-outline" cx="30" cy="77" r="15" /><circle className="accent-outline" cx="130" cy="77" r="15" /></>}
      {visual.kind === "civil-security" && <><path d="M80 9 126 25v29c0 22-17 34-46 40-29-6-46-18-46-40V25Z" /><path className="accent" d="M75 27h10v18h18v10H85v18H75V55H57V45h18Z" /></>}
      {visual.kind === "specialized" && <><path d="M16 54 66 45 76 15h8l10 30 50 9-5 12-45-3-8 24H74l-8-24-45 3Z" /><circle className="accent" cx="80" cy="52" r="6" /></>}
    </svg>
    {!compact && <small>{visual.label}<b>Illustration générique</b></small>}
  </div>;
}

function distanceKm(origin: [number, number], destination: [number, number]) {
  const [lat1, lon1] = origin.map((value) => value * Math.PI / 180);
  const [lat2, lon2] = destination.map((value) => value * Math.PI / 180);
  const dLat = lat2 - lat1, dLon = lon2 - lon1;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function isHelicopter(asset: NationalAsset) {
  const text = `${asset.aircraftType ?? ""} ${asset.description ?? ""} ${asset.operator ?? ""}`.toLowerCase();
  return text.includes("heli") || text.includes("rotor") || /h145|ec145|h135|ec135/.test(text);
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} m`;
}

function formatSpeed(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} km/h`;
}
function passageMinutes(home:[number,number], asset:NationalAsset) {
  if (!asset.speed || asset.track === null || asset.speed < 10) return null;
  const north=(home[0]-asset.latitude)*111.32, east=(home[1]-asset.longitude)*111.32*Math.cos(asset.latitude*Math.PI/180), angle=asset.track*Math.PI/180;
  const vn=Math.cos(angle)*asset.speed, ve=Math.sin(angle)*asset.speed, hours=(north*vn+east*ve)/(vn*vn+ve*ve);
  return hours>0 && hours<=1 ? Math.round(hours*60) : null;
}

function confidenceLabel(value: NationalAsset["identification"]["confidence"]) {
  if (value === "confirmed") return "Confirmé";
  if (value === "probable") return "Probable";
  return "À confirmer";
}

export default function OperationsPanel() {
  const { position } = useLiveGeolocation();
  const [assets, setAssets] = useState<NationalAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Recherche des moyens détectables…");
  const [updatedAt, setUpdatedAt] = useState("—");
  const [query, setQuery] = useState("");
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [reloadSignal, setReloadSignal] = useState(0);
  const [photo, setPhoto] = useState<ExactPhoto | null>(null);
  const [route, setRoute] = useState<{ origin?: { municipality?: string }; destination?: { municipality?: string } } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      try {
        setStatus("Actualisation des moyens détectables…");
        const response = await fetch("/api/national-assets", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;

        const next: NationalAsset[] = Array.isArray(payload.assets) ? payload.assets : [];
        setAssets(next);
        setSelectedId((current) =>
          next.some((item) => item.id === current) ? current : next[0]?.id ?? null
        );
        setStatus(
          response.ok
            ? `${payload.source ?? "Source ADS-B"} • ${next.length} moyen${next.length > 1 ? "s" : ""}`
            : payload.error ?? "Source indisponible"
        );
        setUpdatedAt(
          new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })
        );
        if (response.ok) reportDataUpdate("operations");
      } catch {
        if (!cancelled) {
          setAssets([]);
          setSelectedId(null);
          setStatus("Détection ADS-B momentanément indisponible");
        }
      }
    }

    void loadAssets();
    const timer = window.setInterval(loadAssets, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadSignal]);

  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assets;
    return assets.filter((asset) =>
      `${asset.callsign} ${asset.registration ?? ""} ${asset.aircraftType ?? ""} ${asset.operator ?? ""}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [assets, query]);

  const selected = useMemo(
    () => assets.find((item) => item.id === selectedId) ?? visibleAssets[0] ?? null,
    [assets, selectedId, visibleAssets]
  );

  useEffect(() => {
    let cancelled = false;
    if (!selected) { setPhoto(null); setRoute(null); return; }
    setPhoto(null);
    setRoute(null);
    const photoParams = new URLSearchParams({ hex: selected.id, registration: selected.registration ?? "" });
    void Promise.all([
      fetch(`/api/aircraft-photo?${photoParams}`).then((response) => response.json()),
      fetch(`/api/flight-details?callsign=${encodeURIComponent(selected.callsign)}&aircraft=${encodeURIComponent(selected.registration || selected.id)}&weather=0`).then((response) => response.json())
    ]).then(([photoPayload, routePayload]) => { if (!cancelled) { setPhoto(photoPayload.photo?.image ? photoPayload.photo as ExactPhoto : null); setRoute(routePayload.route ?? null); } }).catch(() => { if (!cancelled) { setPhoto(null); setRoute(null); } });
    return () => { cancelled = true; };
  }, [selected]);

  const points = useMemo(
    () => visibleAssets.map((asset) => ({
      id: asset.id,
      lat: asset.latitude,
      lon: asset.longitude,
      name: asset.callsign,
      detail: asset.identification.model ?? "Non déterminé",
      color: asset.id === selected?.id ? "#00b7ff" : isHelicopter(asset) ? "#4fa8ff" : "#ffb000",
      category: markerCategory(asset),
      heading: asset.track
    })),
    [selected?.id, visibleAssets]
  );

  const helicopters = assets.filter(isHelicopter).length;
  const aircraftCount = assets.length - helicopters;
  const airborne = assets.filter((asset) => !asset.onGround).length;

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const family = asset.identification.category;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets]);

  return (
    <section className="flightwall-v61 national-flightwall">
      <div className="flightwall-commandbar panel">
        <div className="flightwall-actions">
          <button type="button" className="fw-action active" onClick={() => setReloadSignal((value) => value + 1)}>↻ Actualiser</button>
          <button type="button" className="fw-action">Moyens nationaux</button>
          <button type="button" className="fw-action">ADS-B public</button>
        </div>
        <div className="fw-live-summary"><span className="live-dot" /> {status}</div>
      </div>

      <div className="flightwall-main-grid">
        <div className="flightwall-left">
          <div className="flightwall-map-card panel">
            <div className="flightwall-map-stage">
              <StableMap
                points={points}
                center={selected ? [selected.latitude, selected.longitude] : [46.6, 2.5]}
                zoom={selected ? 8 : 6}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                mapVariant={mapStyle}
              />

              <div className="fw-map-search">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un indicatif, un type…" />
              </div>

              <div className="fw-map-style">
                <button className={mapStyle === "street" ? "active" : ""} onClick={() => setMapStyle("street")} type="button">Plan lisible</button>
                <button className={mapStyle === "satellite" ? "active" : ""} onClick={() => setMapStyle("satellite")} type="button">Satellite</button>
                <button className={mapStyle === "dark" ? "active" : ""} onClick={() => setMapStyle("dark")} type="button">Mode sombre</button>
              </div>

              <div className="fw-map-counters">
                <div><span className="ops-counter-symbol">AV</span><strong>{aircraftCount}</strong><small>Avions</small></div>
                <div><span className="ops-counter-symbol">HE</span><strong>{helicopters}</strong><small>Hélicoptères</small></div>
                <div><span className="ops-counter-symbol">AIR</span><strong>{airborne}</strong><small>En vol</small></div>
                <div><span className="ops-counter-symbol">OPS</span><strong>{assets.length}</strong><small>Détectés</small></div>
              </div>
            </div>
          </div>

          <div className="flightwall-bottom-grid">
            <article className="fw-data-card panel">
              <header><div><strong>Répartition</strong><span>Familles identifiées par les données publiques</span></div></header>
              <div className="national-family-list">
                {familyCounts.length ? familyCounts.map(([family, count]) => (
                  <div key={family}><span>{family}</span><strong>{count}</strong></div>
                )) : <p className="fw-empty-text">Aucun moyen actuellement détecté.</p>}
              </div>
            </article>

            <article className="fw-data-card panel fw-nearest-card">
              <header><div><strong>Moyens détectés</strong><span>Sélectionner un appareil</span></div></header>
              <div className="fw-nearest-list">
                {visibleAssets.slice(0, 8).map((asset, index) => (
                  <button type="button" key={asset.id} onClick={() => setSelectedId(asset.id)} className={asset.id === selected?.id ? "selected" : ""}>
                    <b>{index + 1}</b><strong>{asset.identification.badge}</strong><span>{`${asset.operator ?? "Opérateur non déterminé"} • ${asset.callsign} • ${asset.registration ?? "Immat. non déterminée"} • ${formatAltitude(asset.altitude)} • ${formatSpeed(asset.speed)} • ${asset.track === null ? "Cap —" : `Cap ${Math.round(asset.track)}°`} • ${asset.lastSeenSeconds === null ? "MAJ non déterminée" : `MAJ ${Math.round(asset.lastSeenSeconds)} s`} • ${confidenceLabel(asset.identification.confidence)}`}</span><em>{position ? `${distanceKm(position, [asset.latitude, asset.longitude]).toFixed(0)} km` : "Distance : Non déterminé"}</em>
                  </button>
                ))}
                {!visibleAssets.length && <p className="fw-empty-text">Aucun résultat pour cette recherche.</p>}
              </div>
            </article>

            <article className="fw-data-card panel national-limit-card">
              <header><div><strong>Limite des données</strong><span>Information importante</span></div></header>
              <p>Seuls les moyens reçus par la source ADS-B publique apparaissent. Cette page ne remplace pas un outil officiel de disponibilité opérationnelle.</p>
              <small>Dernière actualisation : {updatedAt}</small>
            </article>
          </div>
        </div>

        <aside className="flightwall-focus panel">
          {selected ? (
            <>
              <div className="fw-focus-header">
                <div>
                  <span className="fw-kicker">MOYEN SÉLECTIONNÉ</span>
                  <div className="fw-title-line"><h2>{selected.callsign}</h2></div>
                  <span className={`national-identity-badge ${selected.identification.confidence}`}>{selected.identification.badge}</span>
                  <strong>{selected.identification.operator ?? selected.operator ?? "Opérateur non identifié"}</strong>
                  <p>{selected.identification.model ?? selected.description ?? selected.aircraftType ?? "Modèle à confirmer"}</p>
                </div>
                <NationalAssetPictogram asset={selected} compact />
              </div>

              <div className="national-detail-photo">
                {photo ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.image} alt={`Photo de l’appareil ${selected.callsign}`} onError={() => setPhoto(null)} />
                  <small>Photo de cet appareil • PlaneSpotters{photo.photographer ? ` • ${photo.photographer}` : ""}</small>
                </> : <NationalAssetPictogram asset={selected} />}
              </div>

              <div className="fw-identity-grid">
                <div><span>Immatriculation</span><strong>{selected.registration ?? "—"}</strong></div>
                <div><span>Modèle exact</span><strong>{selected.identification.model ?? selected.aircraftType ?? "À confirmer"}</strong></div>
                <div><span>Catégorie</span><strong>{selected.identification.category}</strong></div>
              </div>

              <div className="national-mission-card"><span>Mission probable</span><strong>{selected.identification.probableMission ?? "Mission non déterminée."}</strong><small>{selected.identification.evidence.length ? `Identification : ${selected.identification.evidence.join(", ")}` : "Données insuffisantes"}</small></div>

              <div className="national-operational-grid">
                <div><span>Organisme</span><strong>{selected.identification.operator ?? selected.operator ?? "Non déterminé"}</strong></div>
                <div><span>Constructeur</span><strong>Non déterminé</strong></div>
                <div><span>Base</span><strong>Non déterminé</strong></div>
                <div><span>Départ</span><strong>{route?.origin?.municipality ?? "Non déterminé"}</strong></div>
                <div><span>Destination</span><strong>{route?.destination?.municipality ?? "Non déterminé"}</strong></div>
                <div><span>Distance HOME</span><strong>{position ? `${distanceKm(position, [selected.latitude, selected.longitude]).toFixed(1)} km` : "Non déterminé"}</strong></div>
                <div><span>Passage estimé</span><strong>{position && passageMinutes(position,selected)!==null ? `${passageMinutes(position,selected)} min` : "Non déterminé"}</strong></div>
                <div><span>Dernière détection</span><strong>{selected.lastSeenSeconds === null ? "Non déterminé" : `il y a ${Math.round(selected.lastSeenSeconds)} s`}</strong></div>
              </div>

              <div className="fw-passage-card national-selected-card">
                <div><span>Position reçue</span><h3>{selected.onGround ? "Appareil au sol" : "Appareil en vol"}</h3><p>Coordonnées issues de la réception ADS-B publique</p></div>
                <div><span>Indicatif</span><strong>{selected.callsign}</strong><small>{selected.id.toUpperCase()}</small></div>
              </div>

              <div className="fw-telemetry-grid">
                <div><span>Altitude</span><strong>{formatAltitude(selected.altitude)}</strong><small>{selected.onGround ? "Au sol" : "Altitude barométrique"}</small></div>
                <div><span>Vitesse</span><strong>{formatSpeed(selected.speed)}</strong><small>Vitesse sol</small></div>
                <div><span>Cap</span><strong>{selected.track === null ? "—" : `${Math.round(selected.track)}°`}</strong><small>Route suivie</small></div>
                <div><span>Position</span><strong>{selected.latitude.toFixed(3)}</strong><small>{selected.longitude.toFixed(3)}</small></div>
              </div>

              <div className="fw-source-grid">
                <div><span>Source</span><strong>Airplanes.live</strong></div>
                <div><span>Suivi</span><strong>ADS-B public</strong></div>
                <div><span>Dernière MAJ</span><strong>{updatedAt}</strong></div>
                <div><span>Identification</span><strong>{confidenceLabel(selected.identification.confidence)}</strong></div>
              </div>
            </>
          ) : (
            <div className="focus-empty"><span className="ops-empty-symbol">OPS</span><h2>Aucun moyen détecté</h2><p>Aucun appareil correspondant aux filtres opérationnels n’est actuellement reçu.</p><small>{status}</small></div>
          )}
        </aside>
      </div>

      <div className="flightwall-statusline"><span>Données publiques en direct</span><span>{assets.length} moyen{assets.length > 1 ? "s" : ""} détecté{assets.length > 1 ? "s" : ""}</span><span><i className="live-dot" /> Actualisation automatique : 2 min</span></div>
    </section>
  );
}
