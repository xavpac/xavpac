"use client";

import { useEffect, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";
import { reportDataUpdate } from "../lib/buildInfo";

type OrbitRecord = {
  OBJECT_NAME?: string;
  NORAD_CAT_ID?: number;
  EPOCH?: string;
};

type SkyWeather = {
  cloud_cover?: number;
  visibility?: number;
  temperature_2m?: number;
  wind_speed_10m?: number;
};
type VisiblePass = { name:string; start:string; maximum:string; end:string; direction:string; maxElevation:number; durationSeconds:number };

export default function AstronomyPanel() {
  const { position, status: positionStatus, error: gpsError } = useLiveGeolocation();
  const [iss, setIss] = useState<OrbitRecord | null>(null);
  const [starlinkCount, setStarlinkCount] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [orbitStatus, setOrbitStatus] = useState("Connexion CelesTrak…");
  const [weather, setWeather] = useState<SkyWeather | null>(null);
  const [issPasses, setIssPasses] = useState<VisiblePass[]>([]);
  const [starlinkPasses, setStarlinkPasses] = useState<VisiblePass[]>([]);


  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [stationsResponse, starlinkResponse, visualResponse] = await Promise.all([
          fetch("/api/orbits?group=stations", { cache: "no-store" }),
          fetch("/api/orbits?group=starlink", { cache: "no-store" }),
          fetch("/api/orbits?group=visual", { cache: "no-store" })
        ]);
        const weatherResponse = position ? await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${position[0]}&longitude=${position[1]}&current=cloud_cover,visibility,temperature_2m,wind_speed_10m&timezone=Europe%2FParis`,
            { cache: "no-store" }
          ) : null;
        const passesResponse = position ? await fetch(`/api/passes?lat=${position[0]}&lon=${position[1]}`, { cache: "no-store" }) : null;

        const [stations, starlink, visual, weatherPayload, passesPayload] = await Promise.all([
          stationsResponse.json(),
          starlinkResponse.json(),
          visualResponse.json(),
          weatherResponse ? weatherResponse.json() : Promise.resolve({ current: null }),
          passesResponse ? passesResponse.json() : Promise.resolve({ iss: [], starlink: [] })
        ]);

        if (cancelled) return;
        const stationRecords = Array.isArray(stations.records) ? stations.records : [];
        setIss(
          stationRecords.find((record: OrbitRecord) =>
            record.OBJECT_NAME?.toUpperCase().includes("ISS")
          ) ?? null
        );
        setStarlinkCount(typeof starlink.count === "number" ? starlink.count : null);
        setVisibleCount(typeof visual.count === "number" ? visual.count : null);
        setWeather(weatherPayload.current ?? null);
        setIssPasses(Array.isArray(passesPayload.iss) ? passesPayload.iss : []);
        setStarlinkPasses(Array.isArray(passesPayload.starlink) ? passesPayload.starlink : []);
        setOrbitStatus(
          stationsResponse.ok && starlinkResponse.ok && visualResponse.ok
            ? "Catalogue orbital actualisé"
            : "Catalogue orbital partiellement disponible"
        );
        if (stationsResponse.ok || starlinkResponse.ok || visualResponse.ok) reportDataUpdate("astronomy");
      } catch {
        if (!cancelled) setOrbitStatus("Sources astronomiques indisponibles");
      }
    }
    load();
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position]);

  const cloudCover = weather?.cloud_cover ?? null;
  const skyQuality =
    cloudCover === null
      ? "Non disponible"
      : cloudCover <= 20
        ? "Très bon ciel"
        : cloudCover <= 50
          ? "Ciel partiellement favorable"
          : "Ciel très nuageux";

  return (
    <>
      <section className="hero astronomy-hero-v4">
        <div>
          <span className="eyebrow">CIEL EN DIRECT</span>
          <h1>Tableau de bord astronomique</h1>
          <p>Catalogue orbital actuel et conditions d’observation selon votre position.</p>
        </div>
        <div className="hero-status neutral">
          <span>🛰️</span>
          <div><strong>{orbitStatus}</strong><small>{positionStatus}</small></div>
        </div>
      </section>

      {gpsError && <div className="gps-banner-v5">📍 {gpsError}</div>}

      <section className="astronomy-console-v4">
        <article className="panel astronomy-primary">
          <div className="panel-title">
            <div>
              <span className="eyebrow">ORBITE</span>
              <h3>ISS et catalogues satellites</h3>
            </div>
            <span className="catalogue-badge">CELESTRAK LIVE</span>
          </div>

          <div className="iss-card-v4">
            <span className="iss-icon-v4">🛰️</span>
            <div>
              <span>Station spatiale internationale</span>
              <h2>{iss?.OBJECT_NAME ?? "ISS"}</h2>
              <p>Dernière époque orbitale : {iss?.EPOCH ?? "non disponible"}</p>
            </div>
          </div>

          <div className="orbit-metrics-v4">
            <div><span>Objets Starlink</span><strong>{starlinkCount ?? "—"}</strong></div>
            <div><span>Satellites visuels</span><strong>{visibleCount ?? "—"}</strong></div>
            <div><span>Identifiant ISS</span><strong>{iss?.NORAD_CAT_ID ?? "25544"}</strong></div>
          </div>

          <div className="astronomy-pass-grid">
            <article><span>ISS — prochain passage visible</span>{issPasses[0] ? <><h3>{new Date(issPasses[0].start).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</h3><p>Début {new Date(issPasses[0].start).toLocaleString("fr-FR")} • Maximum {new Date(issPasses[0].maximum).toLocaleTimeString("fr-FR")} • Fin {new Date(issPasses[0].end).toLocaleTimeString("fr-FR")}</p><small>{issPasses[0].direction} • {issPasses[0].maxElevation}° • {Math.round(issPasses[0].durationSeconds/60)} min</small></> : <strong>Aucun passage visible prochainement.</strong>}</article>
            <article><span>Starlink</span>{starlinkPasses[0] ? <><h3>{new Date(starlinkPasses[0].start).toLocaleString("fr-FR")}</h3><p>{starlinkPasses[0].direction} • {starlinkPasses[0].maxElevation}° • {Math.round(starlinkPasses[0].durationSeconds/60)} min</p><small>Passage individuel calculé — aucun train confirmé par la source.</small></> : <strong>Aucun passage visible prochainement.</strong>}</article>
          </div>
          <details className="passes-seven-days"><summary>Voir les passages des 7 prochains jours</summary>{[...issPasses,...starlinkPasses].sort((a,b)=>a.start.localeCompare(b.start)).map((pass)=><p key={`${pass.name}-${pass.start}`}><strong>{pass.name}</strong> • {new Date(pass.start).toLocaleString("fr-FR")} • {pass.direction} • {pass.maxElevation}°</p>)}</details>

          <div className="honesty-card-v4"><strong>Calcul orbital réel</strong><p>Propagation SGP4 depuis CelesTrak. Un passage est dit visible seulement si l’objet est éclairé, au-dessus de 10° et l’observateur dans le crépuscule ou la nuit.</p></div>
        </article>

        <aside className="astronomy-side-v4">
          <article className="panel sky-conditions-v4">
            <span className="eyebrow">CONDITIONS DU CIEL</span>
            <h2>{skyQuality}</h2>
            <div className="sky-condition-grid">
              <div><span>Nuages</span><strong>{cloudCover === null ? "—" : `${Math.round(cloudCover)} %`}</strong></div>
              <div><span>Visibilité</span><strong>{weather?.visibility === undefined ? "—" : `${Math.round(weather.visibility / 1000)} km`}</strong></div>
              <div><span>Température</span><strong>{weather?.temperature_2m === undefined ? "—" : `${Math.round(weather.temperature_2m)} °C`}</strong></div>
              <div><span>Vent</span><strong>{weather?.wind_speed_10m === undefined ? "—" : `${Math.round(weather.wind_speed_10m)} km/h`}</strong></div>
            </div>
          </article>

          <article className="panel astronomy-guide-v4">
            <span className="eyebrow">REPÈRES DU SOIR</span>
            <div className="planet-guide-row"><span>🌙</span><div><strong>Lune</strong><small>Repérez-la dès le crépuscule selon sa phase.</small></div></div>
            <div className="planet-guide-row"><span>🪐</span><div><strong>Planètes</strong><small>Les positions précises seront ajoutées avec un moteur d’éphémérides.</small></div></div>
            <div className="planet-guide-row"><span>✨</span><div><strong>Starlink</strong><small>Le nombre d’objets catalogués est affiché en direct.</small></div></div>
          </article>
        </aside>
      </section>
    </>
  );
}
