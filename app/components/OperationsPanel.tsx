"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

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
};

type MapStyle = "street" | "satellite" | "dark";

function isHelicopter(asset: NationalAsset) {
  const text = `${asset.aircraftType ?? ""} ${asset.description ?? ""} ${asset.operator ?? ""}`.toLowerCase();
  return text.includes("heli") || text.includes("rotor") || /h145|ec145|h135|ec135/.test(text);
}

function assetFamily(asset: NationalAsset) {
  const text = `${asset.callsign} ${asset.aircraftType ?? ""} ${asset.description ?? ""} ${asset.operator ?? ""}`.toLowerCase();
  if (isHelicopter(asset)) return "Hélicoptère";
  if (/cl-?415|canadair|pelican/.test(text)) return "Canadair";
  if (/q400|dash\s*8|dash/.test(text)) return "Dash";
  if (/beech|king\s*air|b200|b350/.test(text)) return "Beech";
  return "Avion";
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} m`;
}

function formatSpeed(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} km/h`;
}

export default function OperationsPanel() {
  const [assets, setAssets] = useState<NationalAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Recherche des moyens détectables…");
  const [updatedAt, setUpdatedAt] = useState("—");
  const [query, setQuery] = useState("");
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [reloadSignal, setReloadSignal] = useState(0);

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

  const points = useMemo(
    () => visibleAssets.map((asset) => ({
      id: asset.id,
      lat: asset.latitude,
      lon: asset.longitude,
      name: asset.callsign,
      detail: `${assetFamily(asset)} • ${asset.aircraftType ?? asset.description ?? "Type inconnu"}`,
      color: asset.id === selected?.id ? "#00b7ff" : isHelicopter(asset) ? "#4fa8ff" : "#ffb000",
      category: isHelicopter(asset) ? "helicopter" : "aircraft",
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
      const family = assetFamily(asset);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets]);

  return (
    <section className="flightwall-v61 national-flightwall">
      <div className="flightwall-commandbar panel">
        <div className="flightwall-actions">
          <button type="button" className="fw-action active" onClick={() => setReloadSignal((value) => value + 1)}>↻ Actualiser</button>
          <button type="button" className="fw-action">🚒 Moyens nationaux</button>
          <button type="button" className="fw-action">📡 ADS-B public</button>
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
                <div><span>✈️</span><strong>{aircraftCount}</strong><small>Avions</small></div>
                <div><span>🚁</span><strong>{helicopters}</strong><small>Hélicoptères</small></div>
                <div><span>📡</span><strong>{airborne}</strong><small>En vol</small></div>
                <div><span>🚒</span><strong>{assets.length}</strong><small>Détectés</small></div>
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
                    <b>{index + 1}</b><strong>{asset.callsign}</strong><span>{assetFamily(asset)}</span><em>{asset.aircraftType ?? "ADS-B"}</em>
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
                  <strong>{selected.operator ?? "Opérateur non renseigné"}</strong>
                  <p>{selected.description ?? selected.aircraftType ?? "Donnée ADS-B publique"}</p>
                </div>
                <div className="fw-national-visual" aria-hidden="true">{isHelicopter(selected) ? "🚁" : "✈️"}</div>
              </div>

              <div className="fw-identity-grid">
                <div><span>Immatriculation</span><strong>{selected.registration ?? "—"}</strong></div>
                <div><span>Type</span><strong>{selected.aircraftType ?? "—"}</strong></div>
                <div><span>Famille</span><strong>{assetFamily(selected)}</strong></div>
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
                <div><span>Statut</span><strong>{selected.onGround ? "Au sol" : "En vol"}</strong></div>
              </div>
            </>
          ) : (
            <div className="focus-empty"><span>🚒</span><h2>Aucun moyen détecté</h2><p>Aucun appareil correspondant aux filtres opérationnels n’est actuellement reçu.</p><small>{status}</small></div>
          )}
        </aside>
      </div>

      <div className="flightwall-statusline"><span>Données publiques en direct</span><span>{assets.length} moyen{assets.length > 1 ? "s" : ""} détecté{assets.length > 1 ? "s" : ""}</span><span><i className="live-dot" /> Actualisation automatique : 2 min</span></div>
    </section>
  );
}
