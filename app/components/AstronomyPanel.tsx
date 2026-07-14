"use client";

import { useEffect, useState } from "react";

type OrbitRecord = {
  OBJECT_NAME?: string;
  NORAD_CAT_ID?: number;
  EPOCH?: string;
};

const passes = [
  {
    id: "iss",
    icon: "🛰️",
    title: "ISS",
    time: "19 h 49",
    altitude: "35° max",
    countdown: "2 h 20"
  },
  {
    id: "starlink",
    icon: "✨",
    title: "Starlink récent",
    time: "21 h 25",
    altitude: "12° max",
    countdown: "3 h 56"
  },
  {
    id: "isis1",
    icon: "🛰️",
    title: "ISIS 1",
    time: "22 h 17",
    altitude: "40° max",
    countdown: "4 h 48"
  },
  {
    id: "sl8",
    icon: "🛰️",
    title: "SL-8 R/B",
    time: "23 h 02",
    altitude: "23° max",
    countdown: "5 h 33"
  }
];

const planets = [
  { id: "moon", icon: "🌙", name: "Lune", visibility: "Visible dès le coucher du Soleil", direction: "Sud-Ouest" },
  { id: "jupiter", icon: "✨", name: "Jupiter", visibility: "Observable après 02 h 00", direction: "Est" },
  { id: "saturn", icon: "🪐", name: "Saturne", visibility: "Visible en fin de nuit", direction: "Sud-Est" },
  { id: "mars", icon: "🔴", name: "Mars", visibility: "Faible cette nuit", direction: "Est" }
];

export default function AstronomyPanel() {
  const [issRecord, setIssRecord] = useState<OrbitRecord | null>(null);
  const [starlinkCount, setStarlinkCount] = useState<number | null>(null);
  const [orbitStatus, setOrbitStatus] = useState("Connexion CelesTrak…");

  useEffect(() => {
    let cancelled = false;

    async function loadOrbits() {
      try {
        const [stationsResponse, starlinkResponse] = await Promise.all([
          fetch("/api/orbits?group=stations", { cache: "no-store" }),
          fetch("/api/orbits?group=starlink", { cache: "no-store" })
        ]);

        const [stations, starlink] = await Promise.all([
          stationsResponse.json(),
          starlinkResponse.json()
        ]);

        if (cancelled) return;

        const records = Array.isArray(stations.records) ? stations.records : [];
        setIssRecord(
          records.find((record: OrbitRecord) =>
            record.OBJECT_NAME?.toUpperCase().includes("ISS")
          ) ?? null
        );
        setStarlinkCount(
          typeof starlink.count === "number" ? starlink.count : null
        );
        setOrbitStatus(
          stationsResponse.ok && starlinkResponse.ok
            ? "Catalogue orbital CelesTrak connecté"
            : "Catalogue orbital partiellement disponible"
        );
      } catch {
        if (!cancelled) {
          setOrbitStatus("CelesTrak momentanément indisponible");
        }
      }
    }

    loadOrbits();
    const refresh = window.setInterval(loadOrbits, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  return (
    <>
      <section className="hero astronomy-dashboard-hero">
        <div>
          <span className="eyebrow">CIEL EN DIRECT</span>
          <h1>Tableau de bord astronomique</h1>
          <p>Prévisions orbitales adaptées à votre géolocalisation actuelle.</p>
        </div>
        <div className="position-card">
          <span>Source orbitale</span>
          <strong>{orbitStatus}</strong>
        </div>
      </section>

      <section className="panel space-passages">
        <div className="panel-title">
          <div>
            <h3>Passages spatiaux</h3>
            <p className="muted">ISS, Starlink et satellites brillants</p>
          </div>
          <span className="orbit-pill">CATALOGUE LIVE</span>
        </div>

        <div className="iss-main-card">
          <div className="satellite-orbit-icon">🛰️</div>
          <div>
            <span>PROCHAIN PASSAGE ISS</span>
            <strong>2 h 20</strong>
            <small>Prévision indicative • éléments orbitaux actualisés</small>
          </div>
        </div>

        <div className="pass-cards">
          {passes.map((pass) => (
            <article key={pass.id}>
              <span className="pass-icon">{pass.icon}</span>
              <div className="grow">
                <strong>{pass.title}</strong>
                <small>{pass.time} • {pass.altitude}</small>
              </div>
              <strong className="green">{pass.countdown}</strong>
            </article>
          ))}
        </div>

        <div className="orbit-source-grid">
          <div>
            <span>ISS — époque orbitale</span>
            <strong>{issRecord?.EPOCH ?? "Non disponible"}</strong>
          </div>
          <div>
            <span>Objets Starlink au catalogue</span>
            <strong>{starlinkCount ?? "—"}</strong>
          </div>
        </div>

        <p className="tiny-note">
          Les horaires de passage restent indicatifs tant que le calcul SGP4 local
          n’est pas ajouté. CelesTrak fournit ici les éléments orbitaux actuels.
        </p>
      </section>

      <section className="astro-metrics">
        <article className="panel"><span>🛰️ Recalcul orbital</span><strong>Toutes les 10 min</strong></article>
        <article className="panel"><span>📍 Géolocalisation</span><strong>Position GPS</strong></article>
        <article className="panel"><span>☁️ Couverture nuageuse</span><strong>84 %</strong></article>
        <article className="panel"><span>👁️ Visibilité</span><strong>54 km</strong></article>
        <article className="panel"><span>🏳️ Vent local</span><strong>3 km/h</strong></article>
        <article className="panel"><span>🌡️ Température</span><strong>38 °C</strong></article>
      </section>

      <section className="astronomy-lower-grid">
        <article className="panel">
          <span className="eyebrow">EN RÉSUMÉ</span>
          <h3>Ce qu’il faut regarder ce soir</h3>
          <p className="astro-summary">
            Le catalogue orbital est désormais récupéré en direct. La prochaine
            étape sera le calcul local des passages à partir de ta position.
          </p>
        </article>

        <article className="panel">
          <span className="eyebrow">PLANÈTES ET LUNE</span>
          <div className="planet-list">
            {planets.map((planet) => (
              <div key={planet.id} className="planet-row">
                <span className="planet-icon">{planet.icon}</span>
                <div className="grow">
                  <strong>{planet.name}</strong>
                  <small>{planet.visibility}</small>
                </div>
                <span className="planet-direction">{planet.direction}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
