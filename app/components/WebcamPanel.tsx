"use client";

import { useEffect, useMemo, useState } from "react";

type CameraGroup = "aero" | "cities71" | "holidays";
type CameraMode = "image" | "frame";

type CameraItem = {
  id: string;
  group: CameraGroup;
  name: string;
  area: string;
  country: string;
  latitude: number;
  longitude: number;
  sourceName: string;
  sourceUrl: string;
  mode: CameraMode;
  imageUrl?: string;
  frameUrl?: string;
  code?: string;
};

type WeatherCurrent = {
  time: string | null;
  temperature: number | null;
  apparentTemperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  weatherCode: number | null;
  label: string;
};

type WeatherPayload = {
  source?: string;
  fetchedAt?: string;
  current?: WeatherCurrent;
};

type MetarItem = {
  rawOb?: string;
};

const GROUPS: Array<{ id: CameraGroup; title: string; subtitle: string }> = [
  { id: "aero", title: "Aéronautique", subtitle: "Terrains & aérodromes" },
  { id: "cities71", title: "Villes 71", subtitle: "Saône-et-Loire" },
  { id: "holidays", title: "Vacances", subtitle: "Mes destinations" }
];

const CAMERAS: CameraItem[] = [
  { id: "lflh", group: "aero", name: "Grand Chalon", area: "Champforgeuil", country: "France", latitude: 46.826, longitude: 4.817, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFLH_GrandChalon", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFLH_GrandChalon", code: "LFLH" },
  { id: "lfgm", group: "aero", name: "Montceau-les-Mines", area: "Pouilloux", country: "France", latitude: 46.603, longitude: 4.333, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFGM_MontceauLesMines", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFGM_MontceauLesMines", code: "LFGM" },
  { id: "lfgf", group: "aero", name: "Beaune", area: "Côte-d’Or", country: "France", latitude: 47.007, longitude: 4.894, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFGF_ULM_Beaune", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFGF_ULM_Beaune", code: "LFGF" },
  { id: "lfqf", group: "aero", name: "Autun / Morvan", area: "Autun", country: "France", latitude: 46.967, longitude: 4.261, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFQF_AeroclubDuMorvan", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFQF_AeroclubDuMorvan", code: "LFQF" },
  { id: "lfky", group: "aero", name: "Belley", area: "Ain", country: "France", latitude: 45.995, longitude: 5.692, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFKY_AeroClubDeBelley", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFKY_AeroClubDeBelley", code: "LFKY" },
  { id: "lflb", group: "aero", name: "Chambéry", area: "Savoie", country: "France", latitude: 45.638, longitude: 5.881, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFLB_AeroclubDeSavoie", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFLB_AeroclubDeSavoie", code: "LFLB" },
  { id: "lflp", group: "aero", name: "Annecy", area: "Haute-Savoie", country: "France", latitude: 45.929, longitude: 6.099, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFLP_AnnecyTour", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFLP_AnnecyTour", code: "LFLP" },
  { id: "lfmh", group: "aero", name: "Saint-Étienne", area: "Loire", country: "France", latitude: 45.534, longitude: 4.297, sourceName: "Cam-Aéro", sourceUrl: "https://cam-aero.eu/raspicamaero/LFMH_AeroClubSaintEtienne", mode: "image", imageUrl: "https://cam-aero.eu/raspicamaero/LFMH_AeroClubSaintEtienne", code: "LFMH" },

  { id: "macon", group: "cities71", name: "Mâcon", area: "Panorama ville", country: "France", latitude: 46.307, longitude: 4.829, sourceName: "Skaping", sourceUrl: "https://www.skaping.com/macon/ville", frameUrl: "https://www.skaping.com/macon/ville", mode: "frame" },
  { id: "macon-airport", group: "cities71", name: "Mâcon / Charnay", area: "Aérodrome · piste 17/35", country: "France", latitude: 46.295, longitude: 4.795, sourceName: "Traffic-Cams", sourceUrl: "https://www.traffic-cams.com/world/webcam/feed1578229136didkey34610", frameUrl: "https://www.traffic-cams.com/world/webcam/feed1578229136didkey34610", mode: "frame" },
  { id: "cluny-tour", group: "cities71", name: "Cluny", area: "Carrière de la Tour Ronde", country: "France", latitude: 46.434, longitude: 4.659, sourceName: "Cluny Sud Bourgogne", sourceUrl: "https://www.cluny-tourisme.com/webcam/carriere-de-la-tour-ronde/", frameUrl: "https://www.cluny-tourisme.com/webcam/carriere-de-la-tour-ronde/", mode: "frame" },
  { id: "cluny-abbaye", group: "cities71", name: "Cluny", area: "Carrière de l’Abbaye", country: "France", latitude: 46.434, longitude: 4.659, sourceName: "Cluny Sud Bourgogne", sourceUrl: "https://www.cluny-tourisme.com/webcam/carriere-de-labbaye/", frameUrl: "https://www.cluny-tourisme.com/webcam/carriere-de-labbaye/", mode: "frame" },
  { id: "tournus", group: "cities71", name: "Tournus", area: "Quais de Saône", country: "France", latitude: 46.562, longitude: 4.911, sourceName: "Tournus Sud Bourgogne", sourceUrl: "https://www.tournus-tourisme.com/webcam/tournus-en-direct/", frameUrl: "https://www.tournus-tourisme.com/webcam/tournus-en-direct/", mode: "frame" },
  { id: "autun", group: "cities71", name: "Autun", area: "Panorama ville", country: "France", latitude: 46.934, longitude: 4.287, sourceName: "Grand Autunois Morvan", sourceUrl: "https://www.grandautunoismorvan.fr/webcam", frameUrl: "https://www.grandautunoismorvan.fr/webcam", mode: "frame" },
  { id: "digoin", group: "cities71", name: "Digoin", area: "Pont-canal · panoramique", country: "France", latitude: 46.482, longitude: 3.979, sourceName: "Skaping", sourceUrl: "https://www.skaping.com/digoin", frameUrl: "https://www.skaping.com/digoin", mode: "frame" },

  { id: "galtur-breit", group: "holidays", name: "Galtür", area: "Breitspitzbahn · 2120 m", country: "Autriche", latitude: 46.967, longitude: 10.187, sourceName: "Feratel", sourceUrl: "https://www.feratel.com/fr/webcams/autriche/tyrol/galtur-breitspitzbahn", frameUrl: "https://webtvfc.feratel.com/webtv/?cam=5547&design=v5&lg=fr&pg=DA7D2F22-8600-464D-9D4F-CDB04014A6C5&sound=muted", mode: "frame" },
  { id: "galtur-dorf", group: "holidays", name: "Galtür", area: "Village · 1600 m", country: "Autriche", latitude: 46.967, longitude: 10.187, sourceName: "Feratel", sourceUrl: "https://www.feratel.com/fr/webcams/autriche/tyrol/galtur-dorf", frameUrl: "https://webtvfc.feratel.com/webtv/?cam=5548&design=v5&lg=fr&pg=DA7D2F22-8600-464D-9D4F-CDB04014A6C5&sound=muted", mode: "frame" },
  { id: "galtur-kopssee", group: "holidays", name: "Galtür", area: "Kopssee · 1850 m", country: "Autriche", latitude: 46.967, longitude: 10.187, sourceName: "Feratel", sourceUrl: "https://www.feratel.com/fr/webcams/autriche/tyrol/galtur-kopssee", frameUrl: "https://webtvfc.feratel.com/webtv/?cam=5549&design=v5&lg=fr&pg=DA7D2F22-8600-464D-9D4F-CDB04014A6C5&sound=muted", mode: "frame" },
  { id: "galtur-ballun", group: "holidays", name: "Galtür", area: "Ballunspitzbahn · 1950 m", country: "Autriche", latitude: 46.967, longitude: 10.187, sourceName: "Feratel", sourceUrl: "https://www.feratel.com/fr/webcams/autriche/tyrol/galtur-ballunspitzbahn", frameUrl: "https://webtvfc.feratel.com/webtv/?cam=5550&design=v5&lg=fr&pg=DA7D2F22-8600-464D-9D4F-CDB04014A6C5&sound=muted", mode: "frame" },
  { id: "galtur-flying", group: "holidays", name: "Galtür", area: "FlyingCam · 1940 m", country: "Autriche", latitude: 46.967, longitude: 10.187, sourceName: "Feratel", sourceUrl: "https://www.feratel.com/fr/webcams/autriche/tyrol/galtur-flyingcam", frameUrl: "https://webtvfc.feratel.com/webtv/?cam=75547&design=v5&lg=fr&pg=DA7D2F22-8600-464D-9D4F-CDB04014A6C5&sound=muted", mode: "frame" },

  { id: "carroz-telecabine", group: "holidays", name: "Les Carroz", area: "Arrivée télécabine", country: "France", latitude: 46.02558, longitude: 6.64339, sourceName: "Webcam-HD / Les Carroz", sourceUrl: "https://app.webcam-hd.com/lescarroz/arrivee-telecabine", frameUrl: "https://app.webcam-hd.com/lescarroz/arrivee-telecabine", mode: "frame" },
  { id: "carroz-2100", group: "holidays", name: "Les Carroz", area: "Carroz 2100", country: "France", latitude: 46.02558, longitude: 6.64339, sourceName: "Webcam-HD / Les Carroz", sourceUrl: "https://app.webcam-hd.com/lescarroz/carroz-2100", frameUrl: "https://app.webcam-hd.com/lescarroz/carroz-2100", mode: "frame" },
  { id: "carroz-cupoire", group: "holidays", name: "Les Carroz", area: "Pointe de Cupoire", country: "France", latitude: 46.02558, longitude: 6.64339, sourceName: "Webcam-HD / Les Carroz", sourceUrl: "https://app.webcam-hd.com/lescarroz/pointe-de-cupoire", frameUrl: "https://app.webcam-hd.com/lescarroz/pointe-de-cupoire", mode: "frame" },
  { id: "carroz-molliets", group: "holidays", name: "Les Carroz", area: "Les Molliets 1500", country: "France", latitude: 46.02558, longitude: 6.64339, sourceName: "Webcam-HD / Les Carroz", sourceUrl: "https://app.webcam-hd.com/lescarroz/les-molliets-1500", frameUrl: "https://app.webcam-hd.com/lescarroz/les-molliets-1500", mode: "frame" }
];

function formatWindDirection(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return labels[Math.round(value / 45) % 8];
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || value;
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function WebcamPanel() {
  const [activeGroup, setActiveGroup] = useState<CameraGroup>("aero");
  const [selectedId, setSelectedId] = useState("lflh");
  const [refreshKey, setRefreshKey] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [weatherFetchedAt, setWeatherFetchedAt] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [metar, setMetar] = useState<string | null>(null);

  const cameras = useMemo(
    () => CAMERAS.filter((camera) => camera.group === activeGroup),
    [activeGroup]
  );

  const selected = useMemo(
    () => CAMERAS.find((camera) => camera.id === selectedId) ?? CAMERAS[0],
    [selectedId]
  );

  const placeKey = (camera: CameraItem) => {
    if (camera.id.startsWith("macon")) return "Mâcon";
    if (camera.id.startsWith("cluny")) return "Cluny";
    if (camera.id.startsWith("galtur")) return "Galtür";
    if (camera.id.startsWith("carroz")) return "Les Carroz";
    return camera.name;
  };

  const places = useMemo(() => {
    const seen = new Set<string>();
    return cameras.filter((camera) => {
      const key = placeKey(camera);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [cameras]);

  const selectedPlace = placeKey(selected);
  const samePlaceCameras = useMemo(
    () => cameras.filter((camera) => placeKey(camera) === selectedPlace),
    [cameras, selectedPlace]
  );

  useEffect(() => {
    if (selected.group !== activeGroup) {
      const first = CAMERAS.find((camera) => camera.group === activeGroup);
      if (first) setSelectedId(first.id);
    }
  }, [activeGroup, selected.group]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [selectedId, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setWeatherLoading(true);
    setWeather(null);
    setWeatherFetchedAt(null);

    fetch(`/api/webcam-weather?lat=${selected.latitude}&lon=${selected.longitude}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("weather")))
      .then((payload: WeatherPayload) => {
        setWeather(payload.current ?? null);
        setWeatherFetchedAt(payload.fetchedAt ?? null);
        setWeatherLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWeather(null);
        setWeatherLoading(false);
      });

    return () => controller.abort();
  }, [selected, refreshKey]);

  useEffect(() => {
    if (!selected.code) {
      setMetar(null);
      return;
    }

    const controller = new AbortController();
    setMetar(null);

    fetch(`/api/airport-weather?ids=${encodeURIComponent(selected.code)}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("metar")))
      .then((payload: { metar?: MetarItem[] }) => {
        const item = Array.isArray(payload.metar) ? payload.metar[0] : undefined;
        setMetar(item?.rawOb ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetar(null);
      });

    return () => controller.abort();
  }, [selected]);

  return (
    <div className="webcam-module">
      <section className="panel webcam-hero">
        <div>
          <div className="eyebrow">XAVPAC · CAMÉRAS & MÉTÉO</div>
          <h1>Webcams en direct</h1>
          <p className="muted">
            Un même espace pour l’aéronautique, la Saône-et-Loire et tes destinations de vacances.
          </p>
        </div>
        <div className="system-live">● MÉTÉO LIVE</div>
      </section>

      <nav className="webcam-tabs" aria-label="Catégories de webcams">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={activeGroup === group.id ? "active" : ""}
            onClick={() => setActiveGroup(group.id)}
          >
            <strong>{group.title}</strong>
            <small>{group.subtitle}</small>
          </button>
        ))}
      </nav>

      <section className="webcam-grid">
        <article className="panel webcam-main">
          <header className="webcam-head">
            <div>
              <div className="eyebrow">{selected.area} · {selected.country}</div>
              <h2>
                {selected.name}
                {selected.code && <span>{selected.code}</span>}
              </h2>
            </div>
            <button className="tool-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              ↻ Actualiser
            </button>
          </header>

          <div className="weather-strip">
            <div className="weather-primary">
              <span>Maintenant</span>
              <strong>{weatherLoading ? "…" : weather?.temperature !== null && weather?.temperature !== undefined ? `${Math.round(weather.temperature)}°C` : "—"}</strong>
              <small>{weatherLoading ? "Météo en cours…" : weather?.label ?? "Météo indisponible"}</small>
            </div>
            <div>
              <span>Ressenti</span>
              <strong>{weather?.apparentTemperature !== null && weather?.apparentTemperature !== undefined ? `${Math.round(weather.apparentTemperature)}°C` : "—"}</strong>
            </div>
            <div>
              <span>Vent</span>
              <strong>{weather?.windSpeed !== null && weather?.windSpeed !== undefined ? `${Math.round(weather.windSpeed)} km/h` : "—"}</strong>
              <small>{formatWindDirection(weather?.windDirection ?? null)}</small>
            </div>
            <div>
              <span>Mise à jour</span>
              <strong>{formatTime(weatherFetchedAt)}</strong>
              <small>Open-Meteo</small>
            </div>
          </div>

          <div className="webcam-stage">
            {samePlaceCameras.length > 1 && (
              <div className="webcam-camera-switcher" aria-label={`Caméras disponibles à ${selectedPlace}`}>
                <span>{selectedPlace}</span>
                <div>
                  {samePlaceCameras.map((camera, index) => (
                    <button
                      key={camera.id}
                      type="button"
                      className={camera.id === selected.id ? "active" : ""}
                      onClick={() => setSelectedId(camera.id)}
                      title={camera.area}
                      aria-label={`Caméra ${index + 1} · ${camera.area}`}
                    >
                      <b>📷</b>
                      <small>{index + 1}</small>
                    </button>
                  ))}
                </div>
                <em>{selected.area}</em>
              </div>
            )}
            {selected.mode === "image" && selected.imageUrl ? (
              !imageError ? (
                <img
                  key={refreshKey + selected.id}
                  src={`${selected.imageUrl}?xavpac=${refreshKey}`}
                  alt={`Webcam ${selected.name}`}
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="webcam-unavailable">
                  <strong>Image temporairement indisponible</strong>
                  <span>La caméra peut être hors ligne ou en cours d’actualisation.</span>
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Ouvrir la source ↗</a>
                </div>
              )
            ) : (
              <div className="webcam-frame-wrap">
                <iframe
                  key={`${selected.id}-${refreshKey}`}
                  src={selected.frameUrl ?? selected.sourceUrl}
                  title={`Webcam ${selected.name} · ${selected.area}`}
                  loading="eager"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="webcam-frame-badge">
                  <span>● LIVE · {selected.sourceName}</span>
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
                </div>
              </div>
            )}
          </div>

          <div className="webcam-meta">
            <div><span>Lieu</span><strong>{selected.name}</strong></div>
            <div><span>Secteur</span><strong>{selected.area}</strong></div>
            <div><span>Source</span><strong>{selected.sourceName}</strong></div>
          </div>

          {selected.code && (
            <div className="webcam-metar">
              <div className="eyebrow">MÉTÉO AÉRONAUTIQUE</div>
              {metar ? <code>{metar}</code> : <p className="muted">METAR indisponible pour ce terrain.</p>}
            </div>
          )}
        </article>

        <aside className="panel webcam-list">
          <div className="panel-title webcam-list-title">
            <div>
              <div className="eyebrow">{GROUPS.find((group) => group.id === activeGroup)?.title}</div>
              <h3>{places.length} lieu{places.length > 1 ? "x" : ""} · {cameras.length} caméra{cameras.length > 1 ? "s" : ""}</h3>
            </div>
          </div>

          <div className="webcam-buttons">
            {places.map((camera) => {
              const key = placeKey(camera);
              const placeCameras = cameras.filter((item) => placeKey(item) === key);
              const active = key === selectedPlace;
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? "active" : ""}
                  onClick={() => setSelectedId(placeCameras[0].id)}
                >
                  <b>{camera.code ?? "📍"}</b>
                  <span>
                    <strong>{key}</strong>
                    <small>{placeCameras.length > 1 ? `${placeCameras.length} caméras · ${camera.area}` : camera.area}</small>
                  </span>
                  <i>›</i>
                </button>
              );
            })}
          </div>

          <p className="webcam-note">
            Les lecteurs sont chargés automatiquement dans XavPac. Plusieurs vues sont proposées pour les lieux qui disposent de plusieurs caméras.
          </p>
        </aside>
      </section>

      <style jsx>{`
        .webcam-module{display:grid;gap:10px}
        .webcam-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px 20px}
        .webcam-hero h1{margin:5px 0;font-size:clamp(28px,3vw,40px)}
        .webcam-hero p{margin:0;max-width:850px}
        .webcam-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
        .webcam-tabs button{min-height:62px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;color:var(--muted);background:linear-gradient(145deg,rgba(12,35,61,.94),rgba(6,22,39,.94));text-align:left;cursor:pointer}
        .webcam-tabs button.active{border-color:rgba(88,212,255,.58);color:#fff;background:linear-gradient(145deg,rgba(25,81,117,.96),rgba(7,35,59,.96));box-shadow:0 0 22px rgba(88,212,255,.08)}
        .webcam-tabs strong,.webcam-tabs small{display:block}.webcam-tabs strong{font-size:12px}.webcam-tabs small{margin-top:4px;font-size:8px;color:#7e97ab}
        .webcam-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,350px);gap:10px}
        .webcam-main{min-width:0;padding:12px}
        .webcam-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
        .webcam-head h2{margin:4px 0 0;font-size:22px}
        .webcam-head h2 span{margin-left:7px;padding:3px 6px;border:1px solid rgba(88,212,255,.25);border-radius:7px;color:var(--cyan);font-size:11px}
        .weather-strip{display:grid;grid-template-columns:1.2fr repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}
        .weather-strip>div{min-width:0;padding:10px 11px;border:1px solid rgba(88,212,255,.14);border-radius:11px;background:rgba(88,212,255,.045)}
        .weather-strip span,.weather-strip strong,.weather-strip small{display:block}.weather-strip span{color:#7891a5;font-size:7px;text-transform:uppercase;letter-spacing:.06em}.weather-strip strong{margin-top:4px;font-size:15px}.weather-strip small{margin-top:3px;color:#90a7b9;font-size:8px}.weather-primary strong{color:var(--cyan);font-size:22px}
        .webcam-stage{position:relative;min-height:520px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#02090f}
        .webcam-stage>img{width:100%;height:100%;max-height:720px;display:block;object-fit:contain}
        .webcam-unavailable{max-width:620px;display:grid;gap:14px;padding:26px;text-align:center;color:var(--muted)}
        .webcam-unavailable strong{color:#fff}.webcam-unavailable a{color:var(--cyan);text-decoration:none}
        .webcam-frame-wrap{position:relative;width:100%;height:100%;min-height:520px}.webcam-frame-wrap iframe{width:100%;height:100%;min-height:520px;border:0;background:#071522}.webcam-frame-badge{position:absolute;right:10px;bottom:10px;left:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border:1px solid rgba(88,212,255,.22);border-radius:10px;color:#dff8ff;background:rgba(4,17,30,.88);backdrop-filter:blur(10px);font-size:8px;font-weight:900}.webcam-frame-badge span{color:#8cf0be}.webcam-frame-badge a{color:#7edfff;text-decoration:none}
        .webcam-camera-switcher{position:absolute;z-index:20;left:12px;bottom:52px;display:grid;gap:6px;max-width:min(82%,520px);padding:8px 10px;border:1px solid rgba(255,255,255,.22);border-radius:15px;color:#fff;background:rgba(2,14,27,.84);box-shadow:0 10px 28px rgba(0,0,0,.34);backdrop-filter:blur(14px)}
        .webcam-camera-switcher>span{color:#74dcff;font-size:8px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
        .webcam-camera-switcher>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .webcam-camera-switcher button{width:38px;height:38px;display:grid;grid-template-columns:auto auto;place-content:center;gap:2px;border:1px solid rgba(100,197,242,.3);border-radius:50%;color:#dff7ff;background:rgba(14,71,108,.75);cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.22)}
        .webcam-camera-switcher button:hover,.webcam-camera-switcher button.active{border-color:#7de1ff;color:#071523;background:#7de1ff;transform:translateY(-1px)}
        .webcam-camera-switcher button b{font-size:13px;line-height:1}.webcam-camera-switcher button small{font-size:7px;font-weight:950;line-height:1}
        .webcam-camera-switcher>em{overflow:hidden;color:#d8e7f2;font-size:8px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
        .webcam-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px}.webcam-meta>div{padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.025)}.webcam-meta span,.webcam-meta strong{display:block}.webcam-meta span{color:#7891a5;font-size:7px;text-transform:uppercase}.webcam-meta strong{margin-top:3px;font-size:10px}
        .webcam-metar{margin-top:8px;padding:11px;border:1px solid var(--line);border-radius:12px;background:rgba(88,212,255,.05)}.webcam-metar code{display:block;margin-top:7px;color:#e9f8ff;line-height:1.5;white-space:normal}.webcam-metar p{margin:7px 0 0}
        .webcam-list{padding:10px}.webcam-list-title{margin:0;padding:4px 4px 8px}.webcam-list-title h3{margin:4px 0 0}.webcam-buttons{display:grid;gap:4px}.webcam-buttons button{width:100%;display:grid;grid-template-columns:50px minmax(0,1fr) 18px;align-items:center;gap:9px;padding:10px;border:1px solid transparent;border-radius:11px;color:inherit;background:transparent;text-align:left;cursor:pointer}.webcam-buttons button:hover,.webcam-buttons button.active{border-color:rgba(88,212,255,.38);background:rgba(88,212,255,.08)}.webcam-buttons button>b{color:var(--cyan);font-size:9px}.webcam-buttons strong,.webcam-buttons small{display:block}.webcam-buttons small{margin-top:2px;color:var(--muted)}.webcam-buttons i{color:var(--cyan);font-size:18px;font-style:normal}.webcam-note{margin:10px 5px 3px;padding-top:9px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;line-height:1.5}
        @media(max-width:900px){.webcam-grid{grid-template-columns:1fr}.webcam-stage,.webcam-frame-wrap,.webcam-frame-wrap iframe{min-height:440px}}
        @media(max-width:620px){.webcam-hero{flex-direction:column;padding:14px}.webcam-tabs{grid-template-columns:1fr}.weather-strip{grid-template-columns:1fr 1fr}.webcam-meta{grid-template-columns:1fr}.webcam-main{padding:8px}.webcam-stage,.webcam-frame-wrap,.webcam-frame-wrap iframe{min-height:360px}.webcam-camera-switcher{left:7px;right:7px;bottom:48px;max-width:none}.webcam-camera-switcher button{width:34px;height:34px}}
      `}</style>
    </div>
  );
}
