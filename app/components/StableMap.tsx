"use client";

import { Fragment, useEffect } from "react";
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

function MapCamera({
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

function MapClickHandler({ onMapClick }: { onMapClick?: (position: [number, number]) => void }) {
  useMapEvents({ click: (event) => onMapClick?.([event.latlng.lat, event.latlng.lng]) });
  return null;
}

function aircraftSvg(color: string, heading: number, helicopter = false) {
  if (helicopter) {
    return `
      <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
        <path d="M8 30h26c9 0 15 5 18 13H28c-8 0-14-5-20-13Z" fill="${color}" stroke="#06111f" stroke-width="2.8"/>
        <path d="M36 18h4v18h-4zM16 21h40v3H16zM47 40l12 9-3 3-16-9z" fill="${color}" stroke="#06111f" stroke-width="1.7"/>
        <circle cx="23" cy="47" r="3.5" fill="${color}" stroke="#06111f" stroke-width="2"/>
        <circle cx="44" cy="47" r="3.5" fill="${color}" stroke="#06111f" stroke-width="2"/>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M31.8 3.2c2.5 0 4.2 2.1 4.2 5v14.9L55 34.3c1.7 1 2.7 2.6 2.7 4.4v4.2L36 36.3v11.3l7.2 4.5v3.8l-11.4-3-11.4 3v-3.8l7.2-4.5V36.3L6 42.9v-4.2c0-1.8 1-3.4 2.7-4.4l18.9-11.2V8.2c0-2.9 1.7-5 4.2-5Z" fill="${color}" stroke="#06111f" stroke-width="2.9" stroke-linejoin="round"/>
    </svg>`;
}

function homeIcon() {
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-home-marker compact"><span class="xavpac-home-core">•</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
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

function operationalIcon(point: MapPoint, selected: boolean, faded: boolean) {
  const category = String(point.category).replace("national-", "");
  const colors: Record<string, string> = { canadair: "#ff4d61", fireboss: "#ff6f32", dash: "#ff9d36", dragon: "#28a9ff", gendarmerie: "#4c7dff", samu: "#29d596", beechcraft: "#e1b94d", military: "#a5b1bd", customs: "#28c7b6", drone: "#9b78ff", unknown: "#7fb6d5" };
  const labels: Record<string, string> = { canadair: "CANADAIR", fireboss: "FIRE BOSS", dash: "DASH", dragon: "DRAGON", gendarmerie: "GEND.", samu: "SAMU", beechcraft: "BEECH", military: "ARMÉE", customs: "DOUANE", drone: "DRONE", unknown: "OPS" };
  const color = colors[category] ?? colors.unknown;
  const fallbacks: Record<string, string> = { canadair: "🔥", fireboss: "🔥", dash: "🚒", dragon: "🚁", gendarmerie: "🚓", samu: "🚑", beechcraft: "✈️", military: "✈️", customs: "🛃", drone: "◆", unknown: "✈️" };
  const media = point.thumbnailUrl
    ? `<img src="${escapeHtml(point.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="national-marker-fallback" aria-hidden="true">${fallbacks[category] ?? fallbacks.unknown}</span>`;
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="national-map-marker ${selected ? "selected" : ""} ${faded ? "faded" : ""}" style="--national-color:${color}"><div class="national-marker-pulse"></div><div class="national-marker-beacon">${media}<span class="national-marker-kind">${escapeHtml(labels[category] ?? labels.unknown)}</span></div><strong>${escapeHtml(point.name)}</strong><div class="national-position-pin" aria-hidden="true"></div></div>`,
    iconSize: [110, 100],
    iconAnchor: [55, 90],
    popupAnchor: [0, -88]
  });
}

function pointIcon(point: MapPoint, selected: boolean, faded: boolean) {
  if (point.category === "home") return homeIcon();
  if (point.category === "location") return L.divIcon({ className: "xavpac-map-icon-root", html: `<div class="xavpac-selected-location">📍<strong>POINT</strong></div>`, iconSize: [72, 44], iconAnchor: [36, 40] });
  if (point.category === "route-airport") return L.divIcon({ className: "xavpac-map-icon-root", html: `<div class="xavpac-route-airport-marker"><span>●</span><strong>${escapeHtml(point.name)}</strong></div>`, iconSize: [126, 48], iconAnchor: [63, 24], popupAnchor: [0, -25] });
  if (point.category === "aerodrome") return L.divIcon({ className: "xavpac-map-icon-root", html: `<div class="xavpac-aerodrome-marker"><span>+</span><strong>${escapeHtml(point.name)}</strong></div>`, iconSize: [74, 42], iconAnchor: [37, 21] });
  if (point.category === "weather") return weatherIcon(point);
  if (String(point.category).startsWith("national-")) return operationalIcon(point, selected, faded);

  const color = selected ? "#00b7ff" : point.color ?? "#ffb000";
  const helicopter = point.category === "helicopter";
  const heading = typeof point.heading === "number" ? point.heading : 0;

  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `
      <div class="xavpac-aircraft-marker ${selected ? "is-selected" : ""} ${point.category === "remarkable" ? "is-remarkable" : ""} ${faded ? "is-faded" : ""}">
        <div class="xavpac-aircraft-svg">${aircraftSvg(color, heading, helicopter)}</div>
        <div class="xavpac-aircraft-label">
          <strong>${escapeHtml(point.name || "ADS-B")}</strong>
          <span>${escapeHtml(point.detail)}</span>
        </div>
      </div>`,
    iconSize: [148, 108],
    iconAnchor: [74, 54],
    popupAnchor: [0, -48]
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
  onSelect,
  fixedBounds,
  maxBounds,
  lockBounds = false,
  showZoneLabels = false,
  mapVariant = "street",
  focusSignal = 0,
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
  onSelect?: (id: string) => void;
  fixedBounds?: Bounds;
  maxBounds?: Bounds;
  lockBounds?: boolean;
  showZoneLabels?: boolean;
  mapVariant?: MapVariant;
  focusSignal?: number;
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
      <MapCamera center={center} zoom={zoom} radiusKm={radiusKm} fixedBounds={fixedBounds} focusSignal={focusSignal} />
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
          {trail.selected && <Polyline positions={trail.positions} pathOptions={{ color: "#ffffff", weight: 14, opacity: .9, lineCap: "round", lineJoin: "round" }} />}
          <Polyline
            positions={trail.positions}
            pathOptions={{
              color: trail.color ?? "#008fd3",
              weight: trail.selected ? 7 : 3,
              opacity: trail.selected ? 1 : 0.5,
              dashArray: trail.selected ? undefined : "7 8",
              lineCap: "round",
              lineJoin: "round"
            }}
          />
        </Fragment>
      ))}

      {points.map((point) => {
        const selected = point.id === selectedId;
        const isUtility = point.category === "home" || point.category === "weather";
        const faded = Boolean(selectedId) && !selected && !isUtility;
        return (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={pointIcon(point, selected, faded)}
            zIndexOffset={selected ? 1200 : point.category === "home" ? 1100 : point.category === "weather" ? 300 : 0}
            eventHandlers={{ click: () => !isUtility && onSelect?.(point.id) }}
          >
            <Popup><div className="xavpac-popup"><strong>{point.name}</strong><span>{point.detail}</span></div></Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
