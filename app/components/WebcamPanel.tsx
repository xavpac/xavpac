"use client";

import { useEffect, useMemo, useState } from "react";

type Webcam = {
  icao: string;
  name: string;
  area: string;
  imageUrl: string;
};

type MetarItem = {
  rawOb?: string;
};

const CAMERAS: Webcam[] = [
  { icao: "LFLH", name: "Grand Chalon", area: "Saône-et-Loire", imageUrl: "https://cam-aero.eu/raspicamaero/LFLH_GrandChalon" },
  { icao: "LFGM", name: "Montceau-les-Mines", area: "Saône-et-Loire", imageUrl: "https://cam-aero.eu/raspicamaero/LFGM_MontceauLesMines" },
  { icao: "LFGF", name: "Beaune", area: "Côte-d’Or", imageUrl: "https://cam-aero.eu/raspicamaero/LFGF_ULM_Beaune" },
  { icao: "LFQF", name: "Autun / Morvan", area: "Bourgogne", imageUrl: "https://cam-aero.eu/raspicamaero/LFQF_AeroclubDuMorvan" },
  { icao: "LFKY", name: "Belley", area: "Ain", imageUrl: "https://cam-aero.eu/raspicamaero/LFKY_AeroClubDeBelley" },
  { icao: "LFLB", name: "Chambéry", area: "Savoie", imageUrl: "https://cam-aero.eu/raspicamaero/LFLB_AeroclubDeSavoie" },
  { icao: "LFLP", name: "Annecy", area: "Haute-Savoie", imageUrl: "https://cam-aero.eu/raspicamaero/LFLP_AnnecyTour" },
  { icao: "LFMH", name: "Saint-Étienne", area: "Loire", imageUrl: "https://cam-aero.eu/raspicamaero/LFMH_AeroClubSaintEtienne" }
];

export default function WebcamPanel() {
  const [selectedIcao, setSelectedIcao] = useState("LFLH");
  const [refreshKey, setRefreshKey] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [metar, setMetar] = useState<string | null>(null);
  const [metarLoading, setMetarLoading] = useState(true);

  const selected = useMemo(
    () => CAMERAS.find((camera) => camera.icao === selectedIcao) ?? CAMERAS[0],
    [selectedIcao]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [selectedIcao, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setMetar(null);
    setMetarLoading(true);

    fetch(`/api/airport-weather?ids=${encodeURIComponent(selected.icao)}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("weather")))
      .then((payload: { metar?: MetarItem[] }) => {
        const item = Array.isArray(payload.metar) ? payload.metar[0] : undefined;
        setMetar(item?.rawOb ?? null);
        setMetarLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetar(null);
        setMetarLoading(false);
      });

    return () => controller.abort();
  }, [selected]);

  return (
    <div className="webcam-module">
      <section className="panel webcam-hero">
        <div>
          <div className="eyebrow">SPOTTER · WEBCAMS AÉRONAUTIQUES</div>
          <h1>Webcams des terrains</h1>
          <p className="muted">
            Images réelles de plateformes aéronautiques, avec priorité aux terrains proches de la Saône-et-Loire.
          </p>
        </div>
        <div className="system-live">● SOURCE LIVE</div>
      </section>

      <section className="webcam-grid">
        <article className="panel webcam-main">
          <div className="webcam-head">
            <div>
              <div className="eyebrow">{selected.area}</div>
              <h2>{selected.name} <span>{selected.icao}</span></h2>
            </div>
            <button className="tool-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              ↻ Actualiser
            </button>
          </div>

          <div className="webcam-stage">
            {!imageError ? (
              <img
                key={refreshKey + selected.icao}
                src={`${selected.imageUrl}?xavpac=${refreshKey}`}
                alt={`Webcam aéronautique ${selected.name} ${selected.icao}`}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="webcam-unavailable">
                <strong>Image temporairement indisponible</strong>
                <span>La caméra peut être hors ligne ou en cours d’actualisation.</span>
              </div>
            )}
          </div>

          <div className="webcam-meta">
            <div className="source-chip">Source<br /><strong>Cam-Aéro</strong></div>
            <div className="source-chip">Terrain<br /><strong>{selected.icao}</strong></div>
            <a className="source-chip" href={selected.imageUrl} target="_blank" rel="noreferrer">Ouvrir la source ↗</a>
          </div>

          <div className="webcam-weather">
            <div className="eyebrow">MÉTÉO AÉRONAUTIQUE</div>
            {metarLoading ? (
              <p className="muted">Recherche du METAR…</p>
            ) : metar ? (
              <code>{metar}</code>
            ) : (
              <p className="muted">Aucun METAR disponible pour ce terrain. L’image reste la référence visuelle.</p>
            )}
          </div>
        </article>

        <aside className="panel webcam-list">
          <div className="panel-title webcam-list-title">
            <div>
              <div className="eyebrow">RÉSEAU SÉLECTIONNÉ</div>
              <h3>{CAMERAS.length} terrains</h3>
            </div>
          </div>

          <div className="webcam-buttons">
            {CAMERAS.map((camera) => (
              <button
                key={camera.icao}
                type="button"
                className={camera.icao === selected.icao ? "active" : ""}
                onClick={() => setSelectedIcao(camera.icao)}
              >
                <b>{camera.icao}</b>
                <span>
                  <strong>{camera.name}</strong>
                  <small>{camera.area}</small>
                </span>
                <i>›</i>
              </button>
            ))}
          </div>

          <p className="webcam-note">
            Cam-Aéro diffuse des images horodatées de terrains aéronautiques. Ce ne sont pas des flux vidéo continus.
          </p>
        </aside>
      </section>

      <style jsx>{`
        .webcam-module{display:grid;gap:10px}
        .webcam-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px 20px}
        .webcam-hero h1{margin:5px 0;font-size:clamp(28px,3vw,40px)}
        .webcam-hero p{margin:0;max-width:850px}
        .webcam-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,350px);gap:10px}
        .webcam-main{min-width:0;padding:12px}
        .webcam-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
        .webcam-head h2{margin:4px 0 0;font-size:22px}
        .webcam-head h2 span{margin-left:6px;color:var(--cyan);font-size:13px}
        .webcam-stage{aspect-ratio:4/3;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#000}
        .webcam-stage img{width:100%;height:100%;display:block;object-fit:contain}
        .webcam-unavailable{display:grid;gap:6px;padding:18px;text-align:center;color:var(--muted)}
        .webcam-unavailable strong{color:#fff}
        .webcam-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px}
        .webcam-meta .source-chip{display:block;text-align:center;text-decoration:none}
        .webcam-weather{margin-top:8px;padding:11px;border:1px solid var(--line);border-radius:12px;background:rgba(88,212,255,.05)}
        .webcam-weather p{margin:7px 0 0}
        .webcam-weather code{display:block;margin-top:7px;color:#e9f8ff;line-height:1.5;white-space:normal}
        .webcam-list{padding:10px}
        .webcam-list-title{margin:0;padding:4px 4px 8px}
        .webcam-list-title h3{margin:4px 0 0}
        .webcam-buttons{display:grid;gap:4px}
        .webcam-buttons button{width:100%;display:grid;grid-template-columns:50px minmax(0,1fr) 18px;align-items:center;gap:9px;padding:10px;border:1px solid transparent;border-radius:11px;color:inherit;background:transparent;text-align:left;cursor:pointer}
        .webcam-buttons button:hover,.webcam-buttons button.active{border-color:rgba(88,212,255,.38);background:rgba(88,212,255,.08)}
        .webcam-buttons button>b{color:var(--cyan)}
        .webcam-buttons strong,.webcam-buttons small{display:block}
        .webcam-buttons small{margin-top:2px;color:var(--muted)}
        .webcam-buttons i{color:var(--cyan);font-size:18px;font-style:normal}
        .webcam-note{margin:10px 5px 3px;padding-top:9px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;line-height:1.5}
        @media(max-width:900px){.webcam-grid{grid-template-columns:1fr}}
        @media(max-width:560px){.webcam-hero{flex-direction:column;padding:14px}.webcam-meta{grid-template-columns:1fr}.webcam-main{padding:8px}}
      `}</style>
    </div>
  );
}
