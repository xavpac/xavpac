"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { escapeHtml } from "../lib/security/escapeHtml";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from "react-leaflet";

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  detail: string;
  color?: string;
  category?: "home" | "weather" | "commercial" | "military" | "light" | "aircraft" | "helicopter" | "warning" | string;
  heading?: number | null;
  weatherIcon?: string;
  temperature?: number | null;
  thumbnailUrl?: string | null;
};

export type MapTrail = {
  id: string;
  positions: [number, number][];
  color?: string;
  selected?: boolean;
  kind?: "observed" | "heading";
};

export type MapZone = {
  id: string;
  name: string;
  status: "active" | "inactive" | "unknown" | "boundary" | "intersects-height" | "below-floor" | "nearby";
  floor: string;
  ceiling: string;
  positions: [number, number][];
};

type Bounds = [[number, number], [number, number]];
type MapVariant = "layers" | "street" | "satellite" | "dark";
export type MapCameraMode = "free" | "follow" | "focus";
export type MapCameraCommand = { id: number; center: [number, number]; zoom?: number; bounds?: Bounds };

function LegacyMapCamera({
  center,
  zoom,
  radiusKm,
  fixedBounds,
  focusSignal
}: {
  center: [number, number];
  zoom: number;
  radiusKm?: number;
  fixedBounds?: Bounds;
  focusSignal?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (fixedBounds) {
      map.fitBounds(fixedBounds, { padding: [20, 20], animate: true, duration: 0.65 });
      return;
    }

    if (radiusKm) {
      const latitudeDelta = radiusKm / 111;
      const longitudeDelta = radiusKm / (111 * Math.max(Math.cos((center[0] * Math.PI) / 180), 0.25));
      map.fitBounds(
        [
          [center[0] - latitudeDelta, center[1] - longitudeDelta],
          [center[0] + latitudeDelta, center[1] + longitudeDelta]
        ],
        { padding: [32, 32], animate: true, duration: 0.65 }
      );
      return;
    }

    map.flyTo(center, zoom, { animate: true, duration: 0.65 });
  }, [center, fixedBounds, focusSignal, map, radiusKm, zoom]);

  return null;
}

function ControlledMapCamera({
  initialCenter,
  initialZoom,
  initialRadiusKm,
  initialBounds,
  mode,
  command,
  followTarget,
  onModeChange
}: {
  initialCenter: [number, number];
  initialZoom: number;
  initialRadiusKm?: number;
  initialBounds?: Bounds;
  mode: MapCameraMode;
  command?: MapCameraCommand | null;
  followTarget?: [number, number] | null;
  onModeChange?: (mode: MapCameraMode) => void;
}) {
  const map = useMap();
  const initialized = useRef(false);
  const lastCommandId = useRef<number | null>(null);
  const programmatic = useRef(false);
  const releaseTimer = useRef<number | null>(null);

  const runProgrammatic = useCallback((action: () => void) => {
    programmatic.current = true;
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    action();
    releaseTimer.current = window.setTimeout(() => { programmatic.current = false; }, 900);
  }, []);

  useMapEvents({
    dragstart: () => { if (!programmatic.current) onModeChange?.("free"); },
    zoomstart: () => { if (!programmatic.current) onModeChange?.("free"); }
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    runProgrammatic(() => {
      if (initialBounds) map.fitBounds(initialBounds, { padding: [20, 20], animate: false });
      else if (initialRadiusKm) {
        const latitudeDelta = initialRadiusKm / 111;
        const longitudeDelta = initialRadiusKm / (111 * Math.max(Math.cos((initialCenter[0] * Math.PI) / 180), .25));
        map.fitBounds([
          [initialCenter[0] - latitudeDelta, initialCenter[1] - longitudeDelta],
          [initialCenter[0] + latitudeDelta, initialCenter[1] + longitudeDelta]
        ], { padding: [32, 32], animate: false });
      } else map.setView(initialCenter, initialZoom, { animate: false });
    });
  }, [initialBounds, initialCenter, initialRadiusKm, initialZoom, map, runProgrammatic]);

  useEffect(() => {
    if (!command || command.id === lastCommandId.current) return;
    lastCommandId.current = command.id;
    runProgrammatic(() => {
      if (command.bounds) map.fitBounds(command.bounds, { padding: [28, 28], animate: true, duration: .55 });
      else map.flyTo(command.center, command.zoom ?? map.getZoom(), { animate: true, duration: .55 });
    });
  }, [command, map, runProgrammatic]);

  useEffect(() => {
    if (mode !== "follow" || !followTarget) return;
    runProgrammatic(() => map.panTo(followTarget, { animate: false }));
  }, [followTarget, map, mode, runProgrammatic]);

  useEffect(() => () => {
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
  }, []);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick?: (position: [number, number]) => void }) {
  useMapEvents({ click: (event) => onMapClick?.([event.latlng.lat, event.latlng.lng]) });
  return null;
}

function MapViewportGuard() {
  const map = useMap();

  useEffect(() => {
    let frame = 0;
    const container = map.getContainer();
    const invalidate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false, pan: false }));
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
    observer?.observe(container);
    window.addEventListener("resize", invalidate, { passive: true });
    window.addEventListener("orientationchange", invalidate, { passive: true });
    window.visualViewport?.addEventListener("resize", invalidate, { passive: true });
    invalidate();
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("orientationchange", invalidate);
      window.visualViewport?.removeEventListener("resize", invalidate);
    };
  }, [map]);

  return null;
}

function aircraftSvg(color: string, heading: number, category = "aircraft") {
  if (category === "helicopter" || ["dragon", "gendarmerie", "samu"].includes(category)) {
    return `
      <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
        <path d="M8 29h27c9 0 15 5 18 14H28c-9 0-15-5-20-14Z" fill="${color}" stroke="#06111f" stroke-width="2.8"/>
        <path d="M36 16h4v20h-4zM13 20h46v4H13zM47 40l12 9-3 4-17-10z" fill="${color}" stroke="#06111f" stroke-width="1.6"/>
      </svg>`;
  }

  if (category === "glider") {
    return `<svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)"><path d="M32 4l4 22 25 8v5l-25-3-1 17 8 5v3l-11-2-11 2v-3l8-5-1-17-25 3v-5l25-8 4-22Z" fill="${color}" stroke="#06111f" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
  }

  if (category === "balloon") {
    return `<svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)"><path d="M32 5c13 0 22 10 22 23 0 12-9 19-16 24H26C19 47 10 40 10 28 10 15 19 5 32 5Z" fill="${color}" stroke="#06111f" stroke-width="2.8"/><path d="M25 52h14l-3 8h-8z" fill="${color}" stroke="#06111f" stroke-width="2.4"/></svg>`;
  }

  if (category === "autogyro") {
    return `<svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)"><path d="M7 18h50v4H7zM30 20h4v13h-4zM16 36h28l8 10H22c-5 0-8-4-6-10Z" fill="${color}" stroke="#06111f" stroke-width="2.5"/><path d="M41 37l12-8 2 3-9 10z" fill="${color}" stroke="#06111f" stroke-width="2"/></svg>`;
  }

  if (category === "military") {
    return `<svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)"><path d="M32 3l7 24 21 13-3 7-18-6-7 19-7-19-18 6-3-7 21-13 7-24Z" fill="${color}" stroke="#06111f" stroke-width="2.7" stroke-linejoin="round"/></svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M31.8 3.2c2.5 0 4.2 2.1 4.2 5v14.9L55 34.3c1.7 1 2.7 2.6 2.7 4.4v4.2L36 36.3v11.3l7.2 4.5v3.8l-11.4-3-11.4 3v-3.8l7.2-4.5V36.3L6 42.9v-4.2c0-1.8 1-3.4 2.7-4.4l18.9-11.2V8.2c0-2.9 1.7-5 4.2-5Z" fill="${color}" stroke="#06111f" stroke-width="2.9" stroke-linejoin="round"/>
    </svg>`;
}

function referenceIcon(point: MapPoint) {
  const kind = point.category === "moi" ? "moi" : point.category === "location" ? "location" : point.category === "mission" ? "mission" : "home";
  if (kind === "moi" || kind === "location") {
    const pinColor = kind === "moi" ? "#1687ee" : "#8d4ce8";
    return L.divIcon({
      className: "xavpac-map-icon-root",
      html: `<div class="xavpac-geolocation-pin ${kind}"><svg viewBox="0 0 44 54" aria-hidden="true"><path d="M22 2C10.95 2 2 10.95 2 22c0 15.7 20 30 20 30s20-14.3 20-30C42 10.95 33.05 2 22 2Z" fill="${pinColor}" stroke="#fff" stroke-width="3"/><circle cx="22" cy="22" r="7" fill="#fff"/><circle cx="22" cy="22" r="3" fill="${pinColor}"/></svg><strong>${escapeHtml(point.name)}</strong></div>`,
      iconSize: [44, 54],
      iconAnchor: [22, 52],
      popupAnchor: [0, -50]
    });
  }
  const symbol = kind === "mission" ? "+" : "H";
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-reference-marker ${kind}"><span aria-hidden="true">${symbol}</span><strong>${escapeHtml(point.name)}</strong></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -19]
  });
}

function weatherIcon(point: MapPoint) {
  const temperature = typeof point.temperature === "number" ? `${Math.round(point.temperature)}°C` : "—";
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `
      <div class="xavpac-weather-marker">
        <strong>${escapeHtml(point.name)}</strong>
        <span>${escapeHtml(point.weatherIcon ?? "🌤️")} ${escapeHtml(temperature)}</span>
      </div>`,
    iconSize: [122, 46],
    iconAnchor: [61, 23],
    popupAnchor: [0, -24]
  });
}

function operationalIcon(point: MapPoint, selected: boolean, faded: boolean, labelMode: "none" | "callsign" | "detail") {
  const category = String(point.category).replace("national-", "");
  const colors: Record<string, string> = { canadair: "#ff4d61", fireboss: "#ff6f32", dash: "#ff9d36", dragon: "#28a9ff", gendarmerie: "#4c7dff", samu: "#29d596", beechcraft: "#e1b94d", military: "#a5b1bd", customs: "#28c7b6", drone: "#9b78ff", unknown: "#7fb6d5" };
  const labels: Record<string, string> = { canadair: "CANADAIR", fireboss: "FIRE BOSS", dash: "DASH", dragon: "DRAGON", gendarmerie: "GEND.", samu: "SAMU", beechcraft: "BEECH", military: "ARMÉE", customs: "DOUANE", drone: "DRONE", unknown: "OPS" };
  const color = colors[category] ?? colors.unknown;
  const label = labelMode === "none" ? "" : `<div class="xavpac-silhouette-label"><strong>${escapeHtml(point.name)}</strong>${labelMode === "detail" ? `<span>${escapeHtml(labels[category] ?? labels.unknown)}</span>` : ""}</div>`;
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-silhouette-marker is-operational ${selected ? "is-selected" : ""} ${faded ? "is-faded" : ""}" style="--aircraft-color:${color}"><span class="xavpac-marker-accessible-name">${escapeHtml(point.name)}</span><div class="xavpac-silhouette-svg" aria-hidden="true">${aircraftSvg(color, point.heading ?? 0, category)}</div>${label}</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -25]
  });
}

function pointIcon(point: MapPoint, selected: boolean, faded: boolean, labelMode: "none" | "callsign" | "detail") {
  if (["home", "moi", "mission", "location"].includes(String(point.category))) return referenceIcon(point);
  if (String(point.category).startsWith("lightning")) {
    const color = point.color ?? "#f6c453";
    return L.divIcon({
      className: "xavpac-map-icon-root",
      html: `<div class="xavpac-lightning-marker ${escapeHtml(String(point.category))}" style="--lightning-color:${escapeHtml(color)}"><span aria-hidden="true">⚡</span><strong>${escapeHtml(point.name)}</strong></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });
  }
  if (point.category === "route-airport") return L.divIcon({ className: "xavpac-map-icon-root", html: `<div class="xavpac-route-airport-marker"><span>●</span><strong>${escapeHtml(point.name)}</strong></div>`, iconSize: [126, 48], iconAnchor: [63, 24], popupAnchor: [0, -25] });
  if (point.category === "aerodrome") return L.divIcon({ className: "xavpac-map-icon-root", html: `<div class="xavpac-aerodrome-marker"><span>+</span><strong>${escapeHtml(point.name)}</strong></div>`, iconSize: [74, 42], iconAnchor: [37, 21] });
  if (point.category === "weather") return weatherIcon(point);
  if (String(point.category).startsWith("national-")) return operationalIcon(point, selected, faded, labelMode);

  const color = selected ? "#00b7ff" : point.color ?? "#ffb000";
  const heading = typeof point.heading === "number" ? point.heading : 0;
  const label = labelMode === "none" ? "" : `<div class="xavpac-silhouette-label"><strong>${escapeHtml(point.name || "ADS-B")}</strong>${labelMode === "detail" && point.detail ? `<span>${escapeHtml(point.detail)}</span>` : ""}</div>`;

  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-silhouette-marker ${selected ? "is-selected" : ""} ${point.category === "remarkable" ? "is-remarkable" : ""} ${faded ? "is-faded" : ""}" style="--aircraft-color:${color}"><span class="xavpac-marker-accessible-name">${escapeHtml(point.name || "ADS-B")}</span><div class="xavpac-silhouette-svg" aria-hidden="true">${aircraftSvg(color, heading, point.category)}</div>${label}</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -25]
  });
}

function PointMarkers({ points, selectedId, onSelect }: { points: MapPoint[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const labelMode = zoom < 7 ? "none" : zoom < 10 ? "callsign" : "detail";

  return points.map((point) => {
    const selected = point.id === selectedId;
    const isUtility = ["home", "moi", "mission", "weather", "location", "route-airport", "aerodrome"].includes(String(point.category));
    const isReference = ["home", "moi", "mission", "location"].includes(String(point.category));
    const faded = Boolean(selectedId) && !selected && !isUtility;
    return (
      <Marker
        key={point.id}
        position={[point.lat, point.lon]}
        icon={pointIcon(point, selected, faded, labelMode)}
        zIndexOffset={selected ? 1200 : isReference ? 1100 : point.category === "weather" ? 300 : 0}
        eventHandlers={{ click: () => !isUtility && onSelect?.(point.id) }}
      >
        <Popup><div className="xavpac-popup"><strong>{point.name}</strong><span>{point.detail}</span></div></Popup>
      </Marker>
    );
  });
}

function zoneStyle(status: MapZone["status"]) {
  if (status === "boundary") {
    return { color: "#0089c9", fillColor: "#0089c9", fillOpacity: 0.015, opacity: 0.95, weight: 3, dashArray: "10 7" };
  }
  if (status === "active") {
    return { color: "#d51f3b", fillColor: "#ef334f", fillOpacity: 0.3, opacity: 1, weight: 3.5 };
  }
  if (status === "inactive") {
    return { color: "#1769d2", fillColor: "#2f80ed", fillOpacity: 0.17, opacity: 0.96, weight: 2.8 };
  }
  if (status === "intersects-height") {
    return { color: "#f2364f", fillColor: "#ef334f", fillOpacity: 0.3, opacity: 1, weight: 3.8 };
  }
  if (status === "below-floor") {
    return { color: "#2588ff", fillColor: "#2f80ed", fillOpacity: 0.2, opacity: 1, weight: 3.2 };
  }
  if (status === "nearby") {
    return { color: "#f4b83e", fillColor: "#f4b83e", fillOpacity: 0.16, opacity: 1, weight: 3, dashArray: "11 6" };
  }
  return { color: "#536f8a", fillColor: "#7b93aa", fillOpacity: 0.1, opacity: 0.95, weight: 2.5, dashArray: "8 7" };
}

function zoneStatusLabel(status: MapZone["status"]) {
  if (status === "active") return "ACTIVE — information AZBA officielle";
  if (status === "inactive") return "INACTIVE — information AZBA officielle";
  if (status === "intersects-height") return "VOLUME CONCERNÉ À CETTE HAUTEUR — activation AZBA à vérifier";
  if (status === "below-floor") return "POINT SOUS LE PLANCHER PUBLIÉ — activation AZBA à vérifier";
  if (status === "nearby") return "ZONE PARMI LES PLUS PROCHES — activation AZBA à vérifier";
  return "ACTIVATION NON DÉTERMINÉE — vérifier l’AZBA officiel";
}

function zoneDisplayPriority(status: MapZone["status"]) {
  if (status === "active") return 7;
  if (status === "intersects-height") return 6;
  if (status === "below-floor") return 5;
  if (status === "inactive") return 4;
  if (status === "nearby") return 3;
  if (status === "unknown") return 2;
  return 1;
}

function BaseLayer({ variant }: { variant: MapVariant }) {
  if (variant === "satellite") {
    return <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />;
  }
  if (variant === "dark") {
    return <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />;
  }
  return <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />;
}

export default function StableMap({
  points,
  center,
  zoom = 8,
  selectedId,
  trails = [],
  zones = [],
  radiusKm,
  showRadius = false,
  distanceRingsKm = [],
  onSelect,
  fixedBounds,
  maxBounds,
  lockBounds = false,
  showZoneLabels = false,
  mapVariant = "street",
  focusSignal = 0,
  cameraMode,
  cameraCommand,
  followTarget,
  onCameraModeChange,
  controls = true,
  onMapClick
}: {
  points: MapPoint[];
  center: [number, number];
  zoom?: number;
  selectedId?: string | null;
  trails?: MapTrail[];
  zones?: MapZone[];
  radiusKm?: number;
  showRadius?: boolean;
  distanceRingsKm?: number[];
  onSelect?: (id: string) => void;
  fixedBounds?: Bounds;
  maxBounds?: Bounds;
  lockBounds?: boolean;
  showZoneLabels?: boolean;
  mapVariant?: MapVariant;
  focusSignal?: number;
  cameraMode?: MapCameraMode;
  cameraCommand?: MapCameraCommand | null;
  followTarget?: [number, number] | null;
  onCameraModeChange?: (mode: MapCameraMode) => void;
  controls?: boolean;
  onMapClick?: (position: [number, number]) => void;
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      zoomControl={controls}
      attributionControl={controls}
      maxBounds={maxBounds}
      maxBoundsViscosity={lockBounds ? 1 : 0}
      minZoom={lockBounds ? 7 : 3}
      preferCanvas
      className={`leaflet-map xavpac-modern-map xavpac-readable-map map-${mapVariant}`}
    >
      {cameraMode ? <ControlledMapCamera
        initialCenter={center}
        initialZoom={zoom}
        initialRadiusKm={radiusKm}
        initialBounds={fixedBounds}
        mode={cameraMode}
        command={cameraCommand}
        followTarget={followTarget}
        onModeChange={onCameraModeChange}
      /> : <LegacyMapCamera center={center} zoom={zoom} radiusKm={radiusKm} fixedBounds={fixedBounds} focusSignal={focusSignal} />}
      <MapViewportGuard />
      <MapClickHandler onMapClick={onMapClick} />
      <BaseLayer variant={mapVariant} />

      {showRadius && radiusKm && (
        <Circle
          center={center}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#008fd3", weight: 3, opacity: 0.9, fillColor: "#58c9ff", fillOpacity: 0.06, dashArray: "9 8" }}
        >
          <Tooltip permanent direction="right" className="radius-label">{radiusKm} km</Tooltip>
        </Circle>
      )}

      {distanceRingsKm.filter((radius) => Number.isFinite(radius) && radius > 0).map((radius, index) => (
        <Circle
          key={`distance-ring-${radius}`}
          center={center}
          radius={radius * 1000}
          interactive={false}
          pathOptions={{
            color: "#49b7ff",
            weight: radius <= 10 ? 2.2 : 1.4,
            opacity: Math.max(.28, .88 - index * .1),
            fillOpacity: 0,
            dashArray: radius <= 10 ? "7 7" : "3 9"
          }}
        >
          <Tooltip permanent direction="right" className="radius-label">{radius} km</Tooltip>
        </Circle>
      ))}

      {[...zones].sort((first, second) => zoneDisplayPriority(first.status) - zoneDisplayPriority(second.status)).map((zone) => (
        <Polygon key={zone.id} positions={zone.positions} pathOptions={zoneStyle(zone.status)} eventHandlers={{ click: (event) => onMapClick?.([event.latlng.lat, event.latlng.lng]) }}>
          {showZoneLabels && <Tooltip permanent direction="center" className={`zone-label-v5 ${zone.status}`}>{zone.name}</Tooltip>}
          <Popup>
            <div className="xavpac-popup">
              <strong>{zone.name}</strong>
              {zone.status !== "boundary" && <span>Lecture locale : {zoneStatusLabel(zone.status)}</span>}
              <span>Plancher : {zone.floor}</span>
              <span>Plafond : {zone.ceiling}</span>
            </div>
          </Popup>
        </Polygon>
      ))}

      {trails.map((trail) => (
        <Fragment key={trail.id}>
          {trail.selected && trail.kind !== "heading" && <Polyline positions={trail.positions} pathOptions={{ color: "#ffffff", weight: 14, opacity: .9, lineCap: "round", lineJoin: "round" }} />}
          <Polyline
            positions={trail.positions}
            pathOptions={{
              color: trail.kind === "heading" ? "#00e5ff" : trail.color ?? "#008fd3",
              weight: trail.kind === "heading" ? 5 : trail.selected ? 7 : 3,
              opacity: trail.selected ? 1 : 0.5,
              dashArray: trail.kind === "heading" ? "6 9" : trail.selected ? undefined : "7 8",
              lineCap: "round",
              lineJoin: "round"
            }}
          />
        </Fragment>
      ))}

      <PointMarkers points={points} selectedId={selectedId} onSelect={onSelect} />
    </MapContainer>
  );
}
