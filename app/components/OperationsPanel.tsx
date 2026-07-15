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

function isHelicopter(asset: NationalAsset) {
  const text = `${asset.aircraftType ?? ""} ${asset.description ?? ""}`.toLowerCase();
  return text.includes("heli") || text.includes("rotor");
}

export default function OperationsPanel() {
  const [assets, setAssets] = useState<NationalAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Recherche des moyens détectables…");
  const [updatedAt, setUpdatedAt] = useState("—");

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      try {
        const response = await fetch("/api/national-assets", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        const next = Array.isArray(payload.assets) ? payload.assets : [];
        setAssets(next);
        setSelectedId((current) =>
          next.some((item: NationalAsset) => item.id === current)
            ? current
            : next[0]?.id ?? null
        );
        setStatus(
          response.ok
            ? `${payload.source ?? "Source ADS-B"} • ${next.length} moyen${next.length > 1 ? "s" : ""}`
            : payload.error ?? "Source indisponible"
        );
        setUpdatedAt(
          new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit"
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

    loadAssets();
    const timer = window.setInterval(loadAssets, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const selected = useMemo(
    () => assets.find((item) => item.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId]
  );

  const points = assets.map((asset) => ({
    id: asset.id,
    lat: asset.latitude,
    lon: asset.longitude,
    name: asset.callsign,
    detail: `${asset.aircraftType ?? asset.description ?? "Moyen aérien"} • ${asset.operator ?? "Opérateur non identifié"}`,
    color: asset.id === selected?.id ? "#63ddff" : "#ffbd59",
    category: isHelicopter(asset) ? "helicopter" : "aircraft",
    heading: asset.track
  }));

  return (
    <>
      <section className="hero operations-hero">
        <div>
          <span className="eyebrow">MOYENS NATIONAUX</span>
          <h1>Détection aérienne opérationnelle</h1>
          <p>Uniquement les appareils repérés par une source ADS-B publique — aucune position fictive.</p>
        </div>
        <div className="hero-status neutral">
          <span>📡</span>
          <div><strong>{status}</strong><small>Mise à jour {updatedAt}</small></div>
        </div>
      </section>

      <section className="operations-console">
        <article className="panel national-map-card">
          <div className="panel-title">
            <div>
              <span className="eyebrow">CARTE FRANCE</span>
              <h3>Moyens détectés</h3>
            </div>
            <span className="honest-live-badge">● DÉTECTION ADS-B</span>
          </div>
          <div className="national-map-v4">
            <StableMap
              points={points}
              center={selected ? [selected.latitude, selected.longitude] : [46.5, 2.5]}
              zoom={selected ? 8 : 6}
              selectedId={selected?.id}
              onSelect={setSelectedId}
            />
          </div>
          <div className="data-limit-banner">
            <strong>Limite connue :</strong> un moyen non équipé, non reçu ou masqué n’apparaîtra pas. Cette carte n’est pas un outil officiel de disponibilité opérationnelle.
          </div>
        </article>

        <aside className="national-side">
          <article className="panel">
            {selected ? (
              <>
                <span className="eyebrow">MOYEN SÉLECTIONNÉ</span>
                <div className="national-selected-title">
                  <span>{isHelicopter(selected) ? "🚁" : "✈"}</span>
                  <div><h2>{selected.callsign}</h2><p>{selected.operator ?? selected.description ?? "Donnée ADS-B"}</p></div>
                </div>
                <div className="focus-grid compact-grid">
                  <div><span>Type</span><strong>{selected.aircraftType ?? "—"}</strong></div>
                  <div><span>Immatriculation</span><strong>{selected.registration ?? "—"}</strong></div>
                  <div><span>Altitude</span><strong>{selected.altitude === null ? "—" : `${Math.round(selected.altitude)} m`}</strong></div>
                  <div><span>Vitesse</span><strong>{selected.speed === null ? "—" : `${Math.round(selected.speed)} km/h`}</strong></div>
                </div>
              </>
            ) : (
              <div className="national-empty">
                <span>🚒</span>
                <h2>Aucun moyen identifié</h2>
                <p>Aucun indicatif ou appareil correspondant aux filtres opérationnels n’est actuellement détecté.</p>
              </div>
            )}
          </article>

          <article className="panel">
            <span className="eyebrow">MOYENS DÉTECTÉS</span>
            <div className="national-list">
              {assets.length ? assets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  className={asset.id === selected?.id ? "national-row selected" : "national-row"}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span>{isHelicopter(asset) ? "🚁" : "✈"}</span>
                  <div><strong>{asset.callsign}</strong><small>{asset.aircraftType ?? asset.description ?? "ADS-B"}</small></div>
                </button>
              )) : <p className="muted">Aucune donnée à afficher pour le moment.</p>}
            </div>
          </article>
        </aside>
      </section>
    </>
  );
}
