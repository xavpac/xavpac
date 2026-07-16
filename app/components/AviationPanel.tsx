"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveGeolocation } from "../hooks/useLiveGeolocation";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type LiveAircraft = {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  barometricAltitude: number | null;
  geometricAltitude?: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate?: number | null;
  onGround: boolean;
  squawk?: string | null;
  registration?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
  category?: string | null;
};

type AircraftWithDistance = LiveAircraft & { distance: number };
type Radius = 20 | 50 | 100;
type MapStyle = "street" | "satellite" | "dark";

type CityWeather = {
  name: string;
  latitude: number;
  longitude: number;
  distance: number;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  visibility: number | null;
  cloudCover: number | null;
  weatherCode: number;
  icon: string;
  label: string;
};

type AircraftPhoto = {
  image: string;
  link?: string | null;
  photographer?: string | null;
};

const PREVIEW_AIRCRAFT: AircraftWithDistance[] = [
  { id: "39a123", callsign: "AFR1234", country: "France", longitude: 4.76, latitude: 46.79, barometricAltitude: 10972, geometricAltitude: 11030, velocity: 253, trueTrack: 113, verticalRate: 3.25, onGround: false, squawk: "5632", registration: "F-GKXU", aircraftType: "A320", description: "Airbus A320-214", operator: "Air France", category: "A3", distance: 18.7 },
  { id: "4ca456", callsign: "RYR45GQ", country: "Ireland", longitude: 4.35, latitude: 46.62, barometricAltitude: 9448, geometricAltitude: 9510, velocity: 245, trueTrack: 78, verticalRate: 0, onGround: false, squawk: "2241", registration: "EI-EZZ", aircraftType: "B738", description: "Boeing 737-800", operator: "Ryanair", category: "A3", distance: 23.4 },
  { id: "896789", callsign: "UAE14Q", country: "United Arab Emirates", longitude: 5.16, latitude: 46.82, barometricAltitude: 11887, geometricAltitude: 11930, velocity: 219, trueTrack: 244, verticalRate: -1.8, onGround: false, squawk: "4031", registration: "A6-EQX", aircraftType: "B77W", description: "Boeing 777-300ER", operator: "Emirates", category: "A5", distance: 31.2 },
  { id: "4b1234", callsign: "SAS42P", country: "Sweden", longitude: 5.09, latitude: 46.46, barometricAltitude: 9754, geometricAltitude: 9810, velocity: 226, trueTrack: 302, verticalRate: 0.3, onGround: false, squawk: "1127", registration: "SE-ROJ", aircraftType: "A320", description: "Airbus A320neo", operator: "SAS", category: "A3", distance: 36.8 },
  { id: "39a987", callsign: "AFR27FQ", country: "France", longitude: 4.46, latitude: 46.39, barometricAltitude: 11582, geometricAltitude: 11620, velocity: 265, trueTrack: 61, verticalRate: 0, onGround: false, squawk: "2711", registration: "F-HBNK", aircraftType: "A321", description: "Airbus A321-200", operator: "Air France", category: "A3", distance: 41.6 },
  { id: "4ca777", callsign: "TRA568D", country: "Netherlands", longitude: 4.56, latitude: 46.18, barometricAltitude: 8534, geometricAltitude: 8610, velocity: 218, trueTrack: 338, verticalRate: -2.4, onGround: false, squawk: "3045", registration: "PH-HXN", aircraftType: "B738", description: "Boeing 737-800", operator: "Transavia", category: "A3", distance: 47.1 }
];

const PREVIEW_WEATHER: CityWeather[] = [
  { name: "Mâcon", latitude: 46.3069, longitude: 4.8287, distance: 0, temperature: 27, windSpeed: 8, windDirection: 240, visibility: 10000, cloudCover: 20, weatherCode: 1, icon: "🌤️", label: "Peu nuageux" },
  { name: "Chalon-sur-Saône", latitude: 46.7808, longitude: 4.8532, distance: 53, temperature: 24, windSpeed: 7, windDirection: 230, visibility: 10000, cloudCover: 10, weatherCode: 0, icon: "☀️", label: "Ciel clair" },
  { name: "Le Creusot", latitude: 46.8062, longitude: 4.4166, distance: 64, temperature: 22, windSpeed: 6, windDirection: 210, visibility: 9000, cloudCover: 38, weatherCode: 2, icon: "🌤️", label: "Variable" },
  { name: "Louhans", latitude: 46.6298, longitude: 5.2242, distance: 45, temperature: 25, windSpeed: 5, windDirection: 180, visibility: 10000, cloudCover: 18, weatherCode: 1, icon: "🌤️", label: "Peu nuageux" },
  { name: "Bourg-en-Bresse", latitude: 46.2052, longitude: 5.2255, distance: 37, temperature: 27, windSpeed: 5, windDirection: 160, visibility: 10000, cloudCover: 25, weatherCode: 1, icon: "🌤️", label: "Peu nuageux" }
];

function distanceKm(origin: [number, number], destination: [number, number]) {
  const [lat1, lon1] = origin.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = destination.map((value) => (value * Math.PI) / 180);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} m`;
}

function formatFlightLevel(value: number | null) {
  if (value === null) return "—";
  return `FL${Math.max(0, Math.round(value / 30.48)).toString().padStart(3, "0")}`;
}

function formatSpeedKmh(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 3.6)} km/h`;
}

function formatSpeedKnots(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 1.94384)} kt`;
}

function formatVertical(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const feetPerMinute = value * 196.8504;
  return `${feetPerMinute >= 0 ? "+" : ""}${Math.round(feetPerMinute)} ft/min`;
}

function directionName(track: number | null) {
  if (track === null) return "—";
  const directions = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return `${directions[Math.round(track / 45) % 8]} • ${Math.round(track)}°`;
}

function bearingName(origin: [number, number], destination: [number, number]) {
  const lat1 = (origin[0] * Math.PI) / 180;
  const lat2 = (destination[0] * Math.PI) / 180;
  const dLon = ((destination[1] - origin[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const normalized = (bearing + 360) % 360;
  const directions = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return { label: directions[Math.round(normalized / 45) % 8], bearing: normalized };
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (minutes < 60) return `${minutes} min ${remaining.toString().padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function closestApproach(home: [number, number], aircraft: AircraftWithDistance) {
  if (aircraft.velocity === null || aircraft.trueTrack === null || aircraft.velocity < 2) {
    return { state: "position", seconds: null, minimumDistance: aircraft.distance } as const;
  }

  const north = (aircraft.latitude - home[0]) * 111;
  const east = (aircraft.longitude - home[1]) * 111 * Math.cos((home[0] * Math.PI) / 180);
  const track = (aircraft.trueTrack * Math.PI) / 180;
  const speedKmS = aircraft.velocity / 1000;
  const velocityEast = Math.sin(track) * speedKmS;
  const velocityNorth = Math.cos(track) * speedKmS;
  const denominator = velocityEast ** 2 + velocityNorth ** 2;
  const time = denominator > 0 ? -((east * velocityEast + north * velocityNorth) / denominator) : 0;
  const projected = Math.max(0, Math.min(time, 7200));
  const minEast = east + velocityEast * projected;
  const minNorth = north + velocityNorth * projected;
  const minimumDistance = Math.sqrt(minEast ** 2 + minNorth ** 2);

  if (time < -30) return { state: "passed", seconds: Math.abs(time), minimumDistance } as const;
  if (time <= 0) return { state: "now", seconds: 0, minimumDistance } as const;
  if (time > 7200) return { state: "position", seconds: null, minimumDistance: aircraft.distance } as const;
  return { state: "approaching", seconds: time, minimumDistance } as const;
}

function radarCoordinates(home: [number, number], aircraft: AircraftWithDistance, radius: number) {
  const latDelta = aircraft.latitude - home[0];
  const lonDelta = (aircraft.longitude - home[1]) * Math.cos((home[0] * Math.PI) / 180);
  const x = Math.max(-1, Math.min(1, (lonDelta * 111) / radius));
  const y = Math.max(-1, Math.min(1, (latDelta * 111) / radius));
  return { left: `${50 + x * 45}%`, top: `${50 - y * 45}%` };
}

function aircraftVisual(item: LiveAircraft) {
  const text = `${item.aircraftType ?? ""} ${item.description ?? ""} ${item.category ?? ""} ${item.operator ?? ""}`.toLowerCase();
  if (text.includes("heli") || text.includes("rotor")) return { category: "helicopter", color: "#4fa8ff" };
  if (/(military|armée|air force|fighter|rafale|mirage|trainer)/i.test(text)) return { category: "military", color: "#ff5e78" };
  if (/(cessna|piper|robin|cirrus|ultralight|ulm|glider|bristell)/i.test(text)) return { category: "light", color: "#bc83ff" };
  return { category: "commercial", color: "#ffb000" };
}

function altitudeBand(value: number | null) {
  if (value === null) return 0;
  const fl = value / 30.48;
  if (fl >= 400) return 4;
  if (fl >= 300) return 3;
  if (fl >= 200) return 2;
  if (fl >= 100) return 1;
  return 0;
}

function weatherVisibility(value: number | null) {
  if (value === null) return "—";
  return value >= 10000 ? "> 10 km" : `${(value / 1000).toFixed(1)} km`;
}

export default function AviationPanel() {
  const { position, status: positionStatus, accuracy, isLive, error: gpsError } = useLiveGeolocation();
  const [radius, setRadius] = useState<Radius>(50);
  const [aircraft, setAircraft] = useState<AircraftWithDistance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [sourceStatus, setSourceStatus] = useState("Connexion Airplanes.live…");
  const [lastUpdate, setLastUpdate] = useState("—");
  const [error, setError] = useState("");
  const [weather, setWeather] = useState<CityWeather[]>([]);
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [showTrails, setShowTrails] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [locateSignal, setLocateSignal] = useState(0);
  const [query, setQuery] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [flightOnly, setFlightOnly] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const trailsRef = useRef<Record<string, [number, number][]>>({});
  const [trailsVersion, setTrailsVersion] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPreviewMode(params.get("preview") === "1");
    try {
      const stored = window.localStorage.getItem("xavpac-favorites");
      if (stored) setFavoriteIds(JSON.parse(stored));
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (previewMode) {
        const sorted = PREVIEW_AIRCRAFT.filter((item) => item.distance <= radius).sort((a, b) => a.distance - b.distance);
        setAircraft(sorted);
        setSelectedId((current) => current && sorted.some((item) => item.id === current) ? current : sorted[0]?.id ?? null);
        setSourceStatus(`MODE APERÇU • ${sorted.length} appareils`);
        setLastUpdate("17:27:19");
        setError("");
        return;
      }
      try {
        setError("");
        const response = await fetch(`/api/aircraft?lat=${position[0]}&lon=${position[1]}&radius=${radius}`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;

        const sorted: AircraftWithDistance[] = (Array.isArray(payload.aircraft) ? payload.aircraft : [])
          .map((item: LiveAircraft) => ({ ...item, distance: distanceKm(position, [item.latitude, item.longitude]) }))
          .filter((item: AircraftWithDistance) => item.distance <= radius + 1)
          .sort((a: AircraftWithDistance, b: AircraftWithDistance) => a.distance - b.distance);

        setAircraft(sorted);
        setLastUpdate(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

        if (sorted.length === 0) {
          setSelectedId(null);
          setManualSelection(false);
        } else if (!manualSelection || !sorted.some((item) => item.id === selectedId)) {
          setSelectedId(sorted[0].id);
          setManualSelection(false);
        }

        for (const item of sorted.slice(0, 80)) {
          const current = trailsRef.current[item.id] ?? [];
          const nextPoint: [number, number] = [item.latitude, item.longitude];
          const previousPoint = current[current.length - 1];
          const isNew = !previousPoint || Math.abs(previousPoint[0] - nextPoint[0]) > 0.00005 || Math.abs(previousPoint[1] - nextPoint[1]) > 0.00005;
          trailsRef.current[item.id] = isNew ? [...current, nextPoint].slice(-50) : current;
        }
        setTrailsVersion((value) => value + 1);

        const source = typeof payload.source === "string" ? payload.source : "Airplanes.live";
        setSourceStatus(response.ok ? `${source} • ${sorted.length} appareil${sorted.length > 1 ? "s" : ""}` : `${source} indisponible`);
        if (!response.ok) setError(payload.error ?? "Source aérienne indisponible.");
      } catch {
        if (!cancelled) {
          setAircraft([]);
          setSelectedId(null);
          setSourceStatus("Airplanes.live indisponible");
          setError("Impossible de récupérer le trafic aérien en direct.");
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position, radius, manualSelection, selectedId, previewMode]);

  useEffect(() => {
    let cancelled = false;
    async function refreshWeather() {
      if (previewMode) {
        setWeather(PREVIEW_WEATHER);
        return;
      }
      try {
        const response = await fetch(`/api/city-weather?lat=${position[0]}&lon=${position[1]}&count=8`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setWeather(Array.isArray(payload.weather) ? payload.weather : []);
      } catch {
        if (!cancelled) setWeather([]);
      }
    }
    refreshWeather();
    const timer = window.setInterval(refreshWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [position, previewMode]);

  const selected = useMemo(() => aircraft.find((item) => item.id === selectedId) ?? aircraft[0] ?? null, [aircraft, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function refreshPhoto() {
      if (!selected) {
        setPhoto(null);
        return;
      }
      setPhotoLoading(true);
      if (previewMode) {
        setPhoto({ image: "/aircraft/illustrative-aircraft.jpg", photographer: "Illustration XavPac" });
        setPhotoLoading(false);
        return;
      }
      try {
        const params = new URLSearchParams({ hex: selected.id, registration: selected.registration ?? "" });
        const response = await fetch(`/api/aircraft-photo?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setPhoto(payload.photo ?? null);
      } catch {
        if (!cancelled) setPhoto(null);
      } finally {
        if (!cancelled) setPhotoLoading(false);
      }
    }
    refreshPhoto();
    return () => { cancelled = true; };
  }, [selected?.id, selected?.registration, previewMode]);

  const visibleAircraft = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const base = flightOnly ? aircraft.filter((item) => !item.onGround) : aircraft;
    if (!normalized) return base;
    return base.filter((item) => `${item.callsign} ${item.registration ?? ""} ${item.aircraftType ?? ""} ${item.operator ?? ""}`.toLowerCase().includes(normalized));
  }, [aircraft, query, flightOnly]);

  const mapPoints = useMemo(
    () => [
      {
        id: "home",
        lat: position[0],
        lon: position[1],
        name: "Votre position",
        detail: positionStatus,
        color: "#3aa7ff",
        category: "home"
      },
      ...weather.map((city) => ({
        id: `weather-${city.name}`,
        lat: city.latitude,
        lon: city.longitude,
        name: city.name,
        detail: `${city.label} • ${city.temperature === null ? "—" : `${Math.round(city.temperature)}°C`} • vent ${city.windSpeed === null ? "—" : `${Math.round(city.windSpeed)} kt`}`,
        category: "weather",
        weatherIcon: city.icon,
        temperature: city.temperature
      })),
      ...visibleAircraft.slice(0, 100).map((item) => {
        const visual = aircraftVisual(item);
        return {
          id: item.id,
          lat: item.latitude,
          lon: item.longitude,
          name: item.callsign,
          detail: `${item.aircraftType ?? "Type inconnu"} • ${formatFlightLevel(item.barometricAltitude)} • ${formatSpeedKnots(item.velocity)}`,
          color: item.id === selected?.id ? "#00b7ff" : visual.color,
          category: visual.category,
          heading: item.trueTrack
        };
      })
    ],
    [position, positionStatus, selected, visibleAircraft, weather]
  );

  const mapTrails = useMemo(
    () => showTrails
      ? visibleAircraft.slice(0, 40).flatMap((item) => {
          const positions = trailsRef.current[item.id] ?? [];
          if (positions.length < 2) return [];
          const visual = aircraftVisual(item);
          return [{ id: item.id, positions, color: item.id === selected?.id ? "#00a8ff" : visual.color, selected: item.id === selected?.id }];
        })
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleAircraft, selected, trailsVersion, showTrails]
  );

  const approach = selected ? closestApproach(position, selected) : null;
  const bearing = selected ? bearingName(position, [selected.latitude, selected.longitude]) : null;
  const estimatedElevation = selected && selected.barometricAltitude !== null && selected.distance > 0
    ? Math.max(0, Math.min(90, (Math.atan2(selected.barometricAltitude, selected.distance * 1000) * 180) / Math.PI))
    : null;

  const altitudeBands = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const item of aircraft) counts[altitudeBand(item.barometricAltitude)] += 1;
    const max = Math.max(1, ...counts);
    return [
      { label: "FL400+", count: counts[4], width: (counts[4] / max) * 100 },
      { label: "FL300 - FL399", count: counts[3], width: (counts[3] / max) * 100 },
      { label: "FL200 - FL299", count: counts[2], width: (counts[2] / max) * 100 },
      { label: "FL100 - FL199", count: counts[1], width: (counts[1] / max) * 100 },
      { label: "FL000 - FL099", count: counts[0], width: (counts[0] / max) * 100 }
    ];
  }, [aircraft]);

  const proximityCounts = useMemo(() => ({
    five: aircraft.filter((item) => item.distance <= 5).length,
    ten: aircraft.filter((item) => item.distance <= 10).length,
    twentyFive: aircraft.filter((item) => item.distance <= 25).length,
    fifty: aircraft.filter((item) => item.distance <= 50).length
  }), [aircraft]);

  function selectAircraft(id: string) {
    setSelectedId(id);
    setManualSelection(true);
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      try { window.localStorage.setItem("xavpac-favorites", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  const approachTitle = approach?.state === "approaching"
    ? `Dans ${formatDuration(approach.seconds ?? 0)}`
    : approach?.state === "passed"
      ? "Passage effectué"
      : approach?.state === "now"
        ? "Au plus près maintenant"
        : "Position reçue en direct";

  return (
    <section className="flightwall-v61">
      <div className="flightwall-commandbar panel">
        <div className="flightwall-actions">
          <button type="button" className={showTrails ? "fw-action active" : "fw-action"} onClick={() => setShowTrails((value) => !value)}>🛩️ Traces</button>
          <button type="button" className={showCircle ? "fw-action active" : "fw-action"} onClick={() => setShowCircle((value) => !value)}>🎯 Cercles</button>
          <button type="button" className={showFilters ? "fw-action active" : "fw-action"} onClick={() => setShowFilters((value) => !value)}>🔽 Filtres</button>
          <button type="button" className="fw-action">🔔 Alertes <b>{aircraft.filter((item) => item.distance <= 5).length}</b></button>
          <button type="button" className="fw-action" onClick={toggleFullscreen}>⛶ Plein écran</button>
        </div>
        <div className="fw-live-summary"><span className={isLive ? "live-dot" : "live-dot off"} /> {sourceStatus}</div>
      </div>

      {previewMode && <div className="fw-preview-banner">APERÇU LOCAL — données de démonstration uniquement pour contrôler le rendu. La version normale utilise Airplanes.live.</div>}
      {showFilters && (
        <div className="fw-filterbar panel">
          <button type="button" className={flightOnly ? "active" : ""} onClick={() => setFlightOnly(true)}>En vol uniquement</button>
          <button type="button" className={!flightOnly ? "active" : ""} onClick={() => setFlightOnly(false)}>Tous les appareils</button>
          <span>{favoriteIds.length} favori{favoriteIds.length > 1 ? "s" : ""}</span>
        </div>
      )}

      {(gpsError || error) && <div className="aviation-warning-v5">{gpsError || error}</div>}

      <div className="flightwall-main-grid">
        <div className="flightwall-left">
          <div className="flightwall-map-card panel">
            <div className="flightwall-map-stage">
              <StableMap
                points={mapPoints}
                center={position}
                radiusKm={radius}
                showRadius={showCircle}
                selectedId={selected?.id}
                trails={mapTrails}
                onSelect={selectAircraft}
                mapVariant={mapStyle}
                focusSignal={locateSignal}
              />

              <div className="fw-map-search">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un vol, une immatriculation…" />
              </div>

              <div className="fw-map-style">
                <button className={mapStyle === "street" ? "active" : ""} onClick={() => setMapStyle("street")} type="button">Plan lisible</button>
                <button className={mapStyle === "satellite" ? "active" : ""} onClick={() => setMapStyle("satellite")} type="button">Satellite</button>
                <button className={mapStyle === "dark" ? "active" : ""} onClick={() => setMapStyle("dark")} type="button">Mode sombre</button>
              </div>

              <div className="fw-radius-selector">
                {[20, 50, 100].map((value) => (
                  <button type="button" key={value} className={radius === value ? "active" : ""} onClick={() => setRadius(value as Radius)}>{value} km</button>
                ))}
              </div>

              <div className="fw-map-counters">
                <div><span>✈️</span><strong>{aircraft.filter((item) => !item.onGround).length}</strong><small>En vol</small></div>
                <div><span>🎯</span><strong>{aircraft.filter((item) => item.distance <= 20).length}</strong><small>À proximité</small></div>
                <div><span>🛬</span><strong>{aircraft.filter((item) => item.onGround).length}</strong><small>Au sol</small></div>
                <button type="button" onClick={() => setLocateSignal((value) => value + 1)}><span>📍</span><strong>HOME</strong><small>Ma position</small></button>
              </div>

              <button type="button" className="fw-locate-button" title="Centrer sur ma position" onClick={() => setLocateSignal((value) => value + 1)}>⌾</button>

              <div className="fw-position-card">
                <span className={isLive ? "live-dot" : "live-dot off"} />
                <div><strong>MA POSITION</strong><small>{position[0].toFixed(4)} N / {position[1].toFixed(4)} E{accuracy ? ` • ±${Math.round(accuracy)} m` : ""}</small></div>
              </div>
            </div>
          </div>

          <div className="flightwall-bottom-grid">
            <article className="fw-data-card panel fw-radar-card">
              <header><strong>Mini radar local</strong><span>Rayon {radius} km</span></header>
              <div className="fw-radar-layout">
                <div className="mini-radar fw-large-radar">
                  <span className="radar-axis horizontal" /><span className="radar-axis vertical" />
                  <span className="radar-circle one" /><span className="radar-circle two" /><span className="radar-circle three" /><span className="radar-center" />
                  {aircraft.slice(0, 22).map((item) => <button type="button" key={item.id} className={item.id === selected?.id ? "radar-blip selected" : "radar-blip"} style={radarCoordinates(position, item, radius)} onClick={() => selectAircraft(item.id)} title={item.callsign} />)}
                </div>
                <div className="fw-proximity-grid">
                  <div><span>≤ 5 km</span><strong>{proximityCounts.five}</strong></div>
                  <div><span>≤ 10 km</span><strong>{proximityCounts.ten}</strong></div>
                  <div><span>≤ 25 km</span><strong>{proximityCounts.twentyFive}</strong></div>
                  <div><span>≤ 50 km</span><strong>{proximityCounts.fifty}</strong></div>
                  <div className="nearest"><span>Le plus proche</span><strong>{aircraft[0] ? `${aircraft[0].distance.toFixed(1)} km` : "—"}</strong></div>
                </div>
              </div>
            </article>

            <article className="fw-data-card panel fw-nearest-card">
              <header><div><strong>Les 5 prochains avions</strong><span>Appareils les plus proches de votre position</span></div></header>
              <div className="fw-nearest-list">
                {aircraft.slice(0, 5).map((item, index) => (
                  <button type="button" key={item.id} onClick={() => selectAircraft(item.id)} className={item.id === selected?.id ? "selected" : ""}>
                    <b>{index + 1}</b><strong>{item.callsign}</strong><span>{item.aircraftType ?? item.registration ?? "ADS-B"}</span><em>{item.distance.toFixed(1)} km</em>
                  </button>
                ))}
                {!aircraft.length && <p className="fw-empty-text">Aucun appareil reçu dans ce rayon.</p>}
              </div>
            </article>

            <article className="fw-data-card panel fw-altitude-card">
              <header><div><strong>Altitudes des avions</strong><span>Répartition par tranche d’altitude</span></div></header>
              <div className="fw-altitude-bars">
                {altitudeBands.map((band, index) => <div key={band.label}><span>{band.label}</span><i style={{ width: `${band.width}%` }} className={`band-${index}`} /><strong>{band.count}</strong></div>)}
              </div>
            </article>
          </div>
        </div>

        <aside className="flightwall-focus panel">
          {selected ? (
            <>
              <div className="fw-focus-header">
                <div><span className="fw-kicker">AVION SÉLECTIONNÉ</span><div className="fw-title-line"><h2>{selected.callsign}</h2><button type="button" className={favoriteIds.includes(selected.id) ? "fw-favorite active" : "fw-favorite"} onClick={() => toggleFavorite(selected.id)} aria-label="Ajouter aux favoris">☆</button></div><strong>{selected.operator ?? "Opérateur non renseigné"}</strong><p>{selected.aircraftType ?? selected.description ?? "Type non disponible"}</p></div>
                <div className={photoLoading ? "fw-aircraft-photo loading" : "fw-aircraft-photo"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo?.image ?? "/aircraft/illustrative-aircraft.jpg"} alt={`Appareil ${selected.callsign}`} />
                  <small>{photo?.photographer ? `Photo : ${photo.photographer}` : "Illustration — photo réelle indisponible"}</small>
                </div>
              </div>

              <div className="fw-identity-grid">
                <div><span>Immatriculation</span><strong>{selected.registration ?? "—"}</strong></div>
                <div><span>Type</span><strong>{selected.aircraftType ?? "—"}</strong></div>
                <div><span>Mode S</span><strong>{selected.id.toUpperCase()}</strong></div>
              </div>

              <div className="fw-passage-card">
                <div><span>Passage au plus près de ma position</span><h3>{approachTitle}</h3><p>{approach?.state === "approaching" ? "L’appareil se rapproche actuellement" : approach?.state === "passed" ? "L’appareil s’éloigne actuellement" : "Calcul à partir de la position ADS-B"}</p></div>
                <div><span>Distance minimale estimée</span><strong>{approach ? `${approach.minimumDistance.toFixed(1)} km` : "—"}</strong><small>Cap {selected.trueTrack === null ? "—" : `${Math.round(selected.trueTrack)}°`}</small></div>
              </div>

              <div className="fw-look-grid">
                <div><span>Où regarder ?</span><strong>{bearing?.label ?? "—"}</strong></div>
                <div><span>Hauteur estimée</span><strong>{estimatedElevation === null ? "—" : `${Math.round(estimatedElevation)}°`}</strong></div>
                <div><span>Distance actuelle</span><strong>{selected.distance.toFixed(1)} km</strong></div>
                <div><span>Vitesse sol</span><strong>{formatSpeedKnots(selected.velocity)}</strong></div>
              </div>

              <div className="fw-route-card">
                <div><span>Départ</span><strong>—</strong><small>Route non fournie par la source ADS-B</small></div>
                <div className="fw-route-line">✈︎ <i /> ✈︎</div>
                <div><span>Arrivée</span><strong>—</strong><small>Route non fournie par la source ADS-B</small></div>
              </div>

              <div className="fw-telemetry-grid">
                <div><span>Altitude</span><strong>{formatFlightLevel(selected.barometricAltitude)}</strong><small>{formatAltitude(selected.barometricAltitude)}</small></div>
                <div><span>Vitesse</span><strong>{formatSpeedKnots(selected.velocity)}</strong><small>{formatSpeedKmh(selected.velocity)}</small></div>
                <div><span>Cap</span><strong>{selected.trueTrack === null ? "—" : `${Math.round(selected.trueTrack)}°`}</strong><small>{directionName(selected.trueTrack).split(" • ")[0]}</small></div>
                <div><span>Vertical</span><strong>{formatVertical(selected.verticalRate)}</strong><small>{selected.onGround ? "Au sol" : (selected.verticalRate ?? 0) > 0.5 ? "Montée" : (selected.verticalRate ?? 0) < -0.5 ? "Descente" : "Palier"}</small></div>
              </div>

              <div className="fw-source-grid">
                <div><span>Source</span><strong>Airplanes.live</strong></div>
                <div><span>Suivi</span><strong>ADS-B</strong></div>
                <div><span>Dernière MAJ</span><strong>{lastUpdate}</strong></div>
                <div><span>N° de vol</span><strong>{selected.callsign}</strong></div>
              </div>

              <div className="fw-weather-strip">
                <header><div><span>MÉTÉO DES VILLES</span><strong>Conditions autour de votre position</strong></div><small>Open-Meteo</small></header>
                <div>
                  {weather.slice(0, 5).map((city) => (
                    <article key={city.name}><span>{city.name}</span><strong>{city.icon} {city.temperature === null ? "—" : `${Math.round(city.temperature)}°C`}</strong><small>Vent {city.windSpeed === null ? "—" : `${Math.round(city.windSpeed)} kt`} • Vis. {weatherVisibility(city.visibility)}</small></article>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="focus-empty"><span>✈</span><h2>Aucun avion détecté</h2><p>Aucun appareil ADS-B reçu dans un rayon de {radius} km.</p><small>{sourceStatus}</small></div>
          )}
        </aside>
      </div>

      <div className="flightwall-statusline"><span>Données en direct et temps réel</span><span>GPS : {positionStatus}</span><span><i className="live-dot" /> Prochaine actualisation : 10 s</span></div>
    </section>
  );
}
