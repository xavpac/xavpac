"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type CurrentWeather = {
  temperature_2m: number;
  precipitation: number;
  weather_code: number;
  cloud_cover: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  wind_direction_10m: number;
};

type OperationalAsset = {
  id: string;
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  track: number | null;
  aircraftType: string | null;
  description: string | null;
  operator: string | null;
};

type NearbyAircraft = {
  id: string;
  callsign: string;
  latitude: number;
  longitude: number;
};

type Portal = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeClass: string;
  href: string;
  source: string;
};


const portals: Portal[] = [
  {
    id: "vigilance",
    icon: "⚠️",
    title: "Vigilance météo",
    subtitle: "Carte départementale et bulletins de suivi.",
    badge: "OFFICIEL",
    badgeClass: "official",
    href: "https://vigilance.meteofrance.fr/fr",
    source: "Météo-France"
  },
  {
    id: "crues",
    icon: "🌊",
    title: "Crues et cours d’eau",
    subtitle: "Vigilance hydrologique et stations suivies.",
    badge: "OFFICIEL",
    badgeClass: "official",
    href: "https://www.vigicrues.gouv.fr/",
    source: "Vigicrues"
  },
  {
    id: "fires",
    icon: "🔥",
    title: "Détections de feux",
    subtitle: "Points chauds observés par satellites.",
    badge: "SATELLITE",
    badgeClass: "satellite",
    href: "https://firms.modaps.eosdis.nasa.gov/map/",
    source: "NASA FIRMS"
  },
  {
    id: "lightning",
    icon: "⚡",
    title: "Foudre en direct",
    subtitle: "Réseau public indicatif, à recouper avec les sources métier.",
    badge: "INDICATIF",
    badgeClass: "indicative",
    href: "https://www.blitzortung.org/fr/live_lightning_maps.php",
    source: "Blitzortung"
  },
  {
    id: "rtba",
    icon: "🛩️",
    title: "Activation RTBA",
    subtitle: "Horaires AZBA publiés par le SIA.",
    badge: "OFFICIEL",
    badgeClass: "official",
    href: "https://www.sia.aviation-civile.gouv.fr/schedules",
    source: "SIA / DGAC"
  },
  {
    id: "uas",
    icon: "🚁",
    title: "Restrictions UAS",
    subtitle: "Couche cartographique pour la catégorie ouverte et l’aéromodélisme.",
    badge: "OFFICIEL",
    badgeClass: "official",
    href: "https://www.geoportail.gouv.fr/donnees/restrictions-uas-categorie-ouverte-et-aeromodelisme",
    source: "Géoportail"
  }
];

function weatherLabel(code: number) {
  if (code === 0) return "ciel dégagé";
  if ([1, 2].includes(code)) return "ciel peu nuageux";
  if (code === 3) return "ciel couvert";
  if ([45, 48].includes(code)) return "brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "bruine";
  if ([61, 63, 65, 66, 67].includes(code)) return "pluie";
  if ([71, 73, 75, 77].includes(code)) return "neige";
  if ([80, 81, 82].includes(code)) return "averses";
  if ([95, 96, 99].includes(code)) return "orages";
  return "conditions variables";
}

function directionLabel(degrees: number) {
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return labels[Math.round(degrees / 45) % 8];
}

function weatherLevel(weather: CurrentWeather | null) {
  if (!weather) return { label: "EN ATTENTE", className: "unknown", icon: "◌" };
  if (
    weather.wind_gusts_10m >= 70 ||
    weather.precipitation >= 5 ||
    [95, 96, 99].includes(weather.weather_code)
  ) {
    return { label: "ATTENTION FORTE", className: "danger", icon: "●" };
  }
  if (
    weather.wind_gusts_10m >= 45 ||
    weather.precipitation >= 1 ||
    [61, 63, 65, 80, 81, 82].includes(weather.weather_code)
  ) {
    return { label: "SURVEILLANCE", className: "warning", icon: "●" };
  }
  return { label: "CALME LOCAL", className: "ok", icon: "●" };
}

function isHelicopter(asset: OperationalAsset) {
  const text = `${asset.aircraftType ?? ""} ${asset.description ?? ""}`.toLowerCase();
  return text.includes("heli") || text.includes("rotor");
}

export default function CenterOperationsPanel() {
  const { position, status: positionStatus, isLive, error: gpsError } = useLiveGeolocation();
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [assets, setAssets] = useState<OperationalAsset[]>([]);
  const [nearbyAircraft, setNearbyAircraft] = useState<NearbyAircraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("—");


  useEffect(() => {
    let cancelled = false;

    async function loadSituation() {
      const [latitude, longitude] = position;
      const weatherParams = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone: "Europe/Paris",
        current: [
          "temperature_2m",
          "precipitation",
          "weather_code",
          "cloud_cover",
          "wind_speed_10m",
          "wind_gusts_10m",
          "wind_direction_10m"
        ].join(",")
      });

      const results = await Promise.allSettled([
        fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`, { cache: "no-store" }),
        fetch("/api/national-assets", { cache: "no-store" }),
        fetch(`/api/aircraft?lat=${latitude}&lon=${longitude}&radius=50`, { cache: "no-store" })
      ]);

      if (cancelled) return;

      const weatherResult = results[0];
      if (weatherResult.status === "fulfilled" && weatherResult.value.ok) {
        const payload = await weatherResult.value.json();
        setWeather(payload.current ?? null);
        setWeatherError(payload.current ? "" : "Donnée locale absente");
      } else {
        setWeather(null);
        setWeatherError("Météo locale indisponible");
      }

      const assetResult = results[1];
      if (assetResult.status === "fulfilled") {
        const payload = await assetResult.value.json();
        const next = Array.isArray(payload.assets) ? payload.assets : [];
        setAssets(next);
        setSelectedId((current) => next.some((item: OperationalAsset) => item.id === current) ? current : null);
      } else {
        setAssets([]);
      }

      const aircraftResult = results[2];
      if (aircraftResult.status === "fulfilled") {
        const payload = await aircraftResult.value.json();
        setNearbyAircraft(Array.isArray(payload.aircraft) ? payload.aircraft : []);
      } else {
        setNearbyAircraft([]);
      }

      setUpdatedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    }

    loadSituation();
    const timer = window.setInterval(loadSituation, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position]);

  const level = weatherLevel(weather);

  const mapPoints = useMemo(() => [
    {
      id: "home",
      lat: position[0],
      lon: position[1],
      name: "Position opérationnelle",
      detail: positionStatus,
      category: "home" as const
    },
    ...assets.map((asset) => ({
      id: asset.id,
      lat: asset.latitude,
      lon: asset.longitude,
      name: asset.callsign,
      detail: `${asset.aircraftType ?? asset.description ?? "Moyen aérien"} • ${asset.operator ?? "Opérateur non identifié"}`,
      category: isHelicopter(asset) ? "helicopter" : "aircraft",
      color: asset.id === selectedId ? "#63ddff" : "#ffbd59",
      heading: asset.track
    }))
  ], [assets, position, positionStatus, selectedId]);

  const briefing = useMemo(() => {
    const lines: Array<{ icon: string; text: string; tone: string }> = [];

    if (weather) {
      lines.push({
        icon: weather.wind_gusts_10m >= 45 ? "🌬️" : "🌤️",
        text: `Météo locale : ${weatherLabel(weather.weather_code)}, ${Math.round(weather.temperature_2m)} °C, vent ${Math.round(weather.wind_speed_10m)} km/h ${directionLabel(weather.wind_direction_10m)}, rafales ${Math.round(weather.wind_gusts_10m)} km/h.`,
        tone: weather.wind_gusts_10m >= 45 ? "warning" : "normal"
      });
    } else {
      lines.push({ icon: "🌦️", text: weatherError || "Chargement de la météo locale…", tone: "muted" });
    }

    lines.push({
      icon: "✈️",
      text: `${nearbyAircraft.length} appareil${nearbyAircraft.length > 1 ? "s" : ""} détecté${nearbyAircraft.length > 1 ? "s" : ""} dans un rayon de 50 km.`,
      tone: "normal"
    });

    lines.push({
      icon: assets.length ? "🚁" : "📡",
      text: assets.length
        ? `${assets.length} moyen${assets.length > 1 ? "s" : ""} aérien${assets.length > 1 ? "s" : ""} à caractère opérationnel détecté${assets.length > 1 ? "s" : ""} par ADS-B en France.`
        : "Aucun moyen national correspondant aux filtres ADS-B n’est actuellement détecté.",
      tone: assets.length ? "attention" : "muted"
    });

    lines.push({
      icon: "🔎",
      text: "Vigilance météo, crues, feux satellites, foudre et AZBA restent à contrôler dans les portails officiels ci-dessous.",
      tone: "muted"
    });

    return lines;
  }, [assets.length, nearbyAircraft.length, weather, weatherError]);

  return (
    <>
      <section className="hero center-ops-hero">
        <div>
          <span className="eyebrow">CODIS 71</span>
          <h1>Tableau de bord opérationnel</h1>
          <p>Météo locale, trafic aérien, moyens détectés et accès immédiat aux sources de référence.</p>
        </div>
        <div className={`ops-readiness ${level.className}`}>
          <span>{level.icon}</span>
          <div>
            <small>INDICATEUR TECHNIQUE LOCAL</small>
            <strong>{level.label}</strong>
            <em>{isLive ? "GPS continu" : "Position de secours"} • mise à jour {updatedAt}</em>
          </div>
        </div>
      </section>

      {gpsError && <div className="gps-banner-v5">📍 {gpsError}</div>}

      <section className="ops-kpi-grid">
        <article className="panel ops-kpi">
          <span className="ops-kpi-icon">🌡️</span>
          <div><small>Température locale</small><strong>{weather ? `${Math.round(weather.temperature_2m)} °C` : "—"}</strong></div>
        </article>
        <article className="panel ops-kpi">
          <span className="ops-kpi-icon">🌬️</span>
          <div><small>Rafales</small><strong>{weather ? `${Math.round(weather.wind_gusts_10m)} km/h` : "—"}</strong></div>
        </article>
        <article className="panel ops-kpi">
          <span className="ops-kpi-icon">✈️</span>
          <div><small>Trafic à 50 km</small><strong>{nearbyAircraft.length}</strong></div>
        </article>
        <article className="panel ops-kpi">
          <span className="ops-kpi-icon">🚁</span>
          <div><small>Moyens détectés</small><strong>{assets.length}</strong></div>
        </article>
      </section>

      <section className="center-ops-console">
        <div className="center-ops-main">
          <article className="panel ops-map-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">SITUATION AÉRIENNE</span>
                <h3>Carte opérationnelle</h3>
                <p className="muted">Position suivie en continu et moyens nationaux détectables par ADS-B.</p>
              </div>
              <span className="ops-source-chip">● AIRPLANES.LIVE</span>
            </div>
            <div className="center-ops-map">
              <StableMap
                points={mapPoints}
                center={position}
                zoom={7}
                selectedId={selectedId}
                onSelect={(id) => id !== "home" && setSelectedId(id)}
              />
            </div>
            <div className="ops-map-limit">
              Les données ADS-B sont indicatives : un appareil non équipé, masqué ou non reçu peut ne pas apparaître.
            </div>
          </article>

          <article className="panel operational-portals-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">SOURCES DE RÉFÉRENCE</span>
                <h3>Accès opérationnels rapides</h3>
              </div>
            </div>
            <div className="operational-portals-grid">
              {portals.map((portal) => (
                <a key={portal.id} className="operational-portal-card" href={portal.href} target="_blank" rel="noreferrer">
                  <div className="operational-portal-top">
                    <span className="operational-portal-icon">{portal.icon}</span>
                    <span className={`operational-portal-badge ${portal.badgeClass}`}>{portal.badge}</span>
                  </div>
                  <strong>{portal.title}</strong>
                  <p>{portal.subtitle}</p>
                  <small>{portal.source} ↗</small>
                </a>
              ))}
            </div>
          </article>
        </div>

        <aside className="center-ops-side">
          <article className="panel ops-briefing-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">POINT RAPIDE</span>
                <h3>Briefing automatique</h3>
              </div>
              <span className="briefing-time">{updatedAt}</span>
            </div>
            <div className="ops-briefing-list">
              {briefing.map((line, index) => (
                <div key={`${line.icon}-${index}`} className={`ops-briefing-line ${line.tone}`}>
                  <span>{line.icon}</span>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="panel ops-weather-panel">
            <span className="eyebrow">CONDITIONS LOCALES</span>
            {weather ? (
              <>
                <div className="ops-weather-head">
                  <strong>{Math.round(weather.temperature_2m)}°</strong>
                  <div><b>{weatherLabel(weather.weather_code)}</b><span>{positionStatus}</span></div>
                </div>
                <div className="ops-weather-details">
                  <div><span>Vent</span><strong>{Math.round(weather.wind_speed_10m)} km/h {directionLabel(weather.wind_direction_10m)}</strong></div>
                  <div><span>Rafales</span><strong>{Math.round(weather.wind_gusts_10m)} km/h</strong></div>
                  <div><span>Pluie</span><strong>{weather.precipitation.toFixed(1)} mm</strong></div>
                  <div><span>Nébulosité</span><strong>{Math.round(weather.cloud_cover)} %</strong></div>
                </div>
              </>
            ) : <p className="muted">{weatherError || "Chargement…"}</p>}
          </article>

          <article className="panel ops-doctrine-panel">
            <span className="eyebrow">UTILISATION</span>
            <h3>Une vue d’anticipation</h3>
            <p>Cette page regroupe les signaux utiles et accélère l’accès aux portails métier. Elle ne remplace ni les systèmes opérationnels du SDIS, ni les messages des autorités, ni les publications aéronautiques officielles.</p>
          </article>
        </aside>
      </section>
    </>
  );
}
