"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

const assets = [
  { id: "dragon69", name: "Dragon 69", type: "Hélicoptère Sécurité civile", mission: "Transit vers le Mâconnais", status: "En vol", lat: 46.72, lon: 4.88, color: "#ff6b6b", distance: "54 km", icon: "🚁" },
  { id: "helismur71", name: "HéliSMUR 71", type: "Hélicoptère médicalisé", mission: "Disponible à Chalon", status: "Au sol", lat: 46.78, lon: 4.85, color: "#52d273", distance: "27 km", icon: "🚑" },
  { id: "dash8", name: "Milan 75", type: "Dash 8 Q400-MR", mission: "Surveillance", status: "En vol", lat: 45.82, lon: 4.71, color: "#ffbd59", distance: "88 km", icon: "🛩️" },
  { id: "canadair", name: "Pélican 36", type: "Canadair CL-415", mission: "Transit opérationnel", status: "En vol", lat: 44.55, lon: 5.12, color: "#ff6b6b", distance: "126 km", icon: "✈️" }
];

export default function OperationsPanel() {
  const [selectedId, setSelectedId] = useState(assets[0].id);
  const selected = assets.find(asset => asset.id === selectedId) ?? assets[0];

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">MOYENS NATIONAUX</span>
          <h1>Moyens aériens nationaux</h1>
          <p>Le moyen sélectionné reste mis en évidence sur la carte pour faciliter son suivi.</p>
        </div>
      </section>

      <section className="operations-layout">
        <div className="panel operation-map-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">CARTE NATIONALE</span>
              <h3>Moyens prioritaires</h3>
            </div>
            <span className="live-pill">● EN DIRECT</span>
          </div>

          <div className="operation-map compact-map">
            <StableMap
              points={assets.map(asset => ({
                id: asset.id,
                lat: asset.lat,
                lon: asset.lon,
                name: asset.name,
                detail: `${asset.type} • ${asset.status} • ${asset.mission}`,
                color: asset.color,
                icon: asset.icon,
                category: asset.category as any
              }))}
              center={[selected.lat, selected.lon]}
              zoom={7}
              selectedId={selectedId}
            />
          </div>

          <div className="map-selection-strip">
            <span className="selected-map-icon">{selected.icon}</span>
            <div>
              <span>Moyen actuellement suivi</span>
              <strong>{selected.name}</strong>
            </div>
          </div>
        </div>

        <aside className="operation-side">
          <article className="panel selected-aircraft">
            <span className="eyebrow">MOYEN SÉLECTIONNÉ</span>

            <div className="selected-operation-heading">
              <span className="large-operation-icon">{selected.icon}</span>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.type}</p>
              </div>
            </div>

            <div className="info-list">
              <div><span>État</span><strong>{selected.status}</strong></div>
              <div><span>Mission</span><strong>{selected.mission}</strong></div>
              <div><span>Distance</span><strong>{selected.distance}</strong></div>
            </div>
          </article>

          <article className="panel">
            <span className="eyebrow">MOYENS SUIVIS</span>

            <div className="rows">
              {assets.map(asset => (
                <button
                  key={asset.id}
                  className={asset.id === selectedId ? "asset-row selected" : "asset-row"}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span
                    className={asset.id === selectedId ? "round operation-icon selected" : "round operation-icon"}
                  >
                    {asset.icon}
                  </span>

                  <span className="grow">
                    <strong>{asset.name}</strong>
                    <small>{asset.type} • {asset.status}</small>
                  </span>

                  <strong>{asset.distance}</strong>
                </button>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </>
  );
}
