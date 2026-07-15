"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap
} from "react-leaflet";

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  detail: string;
  color?: string;
  category?: "home" | "commercial" | "military" | "light" | "aircraft" | "helicopter" | "warning" | string;
  heading?: number | null;
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
  status: "active" | "inactive" | "unknown" | "boundary";
  floor: string;
  ceiling: string;
  positions: [number, number][];
};

type Bounds = [[number, number], [number, number]];

function FitMap({
  center,
  zoom,
  radiusKm,
  fixedBounds
}: {
  center: [number, number];
  zoom: number;
  radiusKm?: number;
  fixedBounds?: Bounds;
}) {
  const map = useMap();

  useEffect(() => {
    if (fixedBounds) {
      map.fitBounds(fixedBounds, { padding: [20, 20], animate: true, duration: 0.65 });
      return;
    }

    if (radiusKm) {
      const latitudeDelta = radiusKm / 111;
      const longitudeDelta =
        radiusKm /
        (111 * Math.max(Math.cos((center[0] * Math.PI) / 180), 0.25));

      map.fitBounds(
        [
          [center[0] - latitudeDelta, center[1] - longitudeDelta],
          [center[0] + latitudeDelta, center[1] + longitudeDelta]
        ],
        { padding: [28, 28], animate: true, duration: 0.65 }
      );
      return;
    }

    map.flyTo(center, zoom, { animate: true, duration: 0.65 });
  }, [center, fixedBounds, map, radiusKm, zoom]);

  return null;
}

function aircraftSvg(color: string, heading: number, helicopter = false) {
  if (helicopter) {
    return `
      <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
        <path d="M8 30h26c9 0 15 5 18 13H28c-8 0-14-5-20-13Z" fill="${color}" stroke="white" stroke-width="2"/>
        <path d="M36 18h4v18h-4zM16 21h40v3H16zM47 40l12 9-3 3-16-9z" fill="${color}" stroke="white" stroke-width="1.2"/>
        <circle cx="23" cy="47" r="3.5" fill="${color}" stroke="white" stroke-width="1.8"/>
        <circle cx="44" cy="47" r="3.5" fill="${color}" stroke="white" stroke-width="1.8"/>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M31.8 3.2c2.5 0 4.2 2.1 4.2 5v14.9L55 34.3c1.7 1 2.7 2.6 2.7 4.4v4.2L36 36.3v11.3l7.2 4.5v3.8l-11.4-3-11.4 3v-3.8l7.2-4.5V36.3L6 42.9v-4.2c0-1.8 1-3.4 2.7-4.4l18.9-11.2V8.2c0-2.9 1.7-5 4.2-5Z" fill="${color}" stroke="white" stroke-width="2.2" stroke-linejoin="round"/>
    </svg>`;
}

function homeIcon() {
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-home-marker"><span class="xavpac-home-core"></span><span class="xavpac-home-ring"></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function pointIcon(point: MapPoint, selected: boolean, faded: boolean) {
  if (point.category === "home") return homeIcon();

  const color = selected ? "#63ddff" : point.color ?? "#ffb34d";
  const helicopter = point.category === "helicopter";
  const heading = typeof point.heading === "number" ? point.heading : 0;

  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `
      <div class="xavpac-aircraft-marker ${selected ? "is-selected" : ""} ${faded ? "is-faded" : ""}">
        <div class="xavpac-aircraft-svg">${aircraftSvg(color, heading, helicopter)}</div>
        <div class="xavpac-aircraft-label">${point.name}</div>
      </div>`,
    iconSize: [108, 82],
    iconAnchor: [54, 41],
    popupAnchor: [0, -36]
  });
}

function zoneStyle(status: MapZone["status"]) {
  if (status === "boundary") {
    return {
      color: "#63ddff",
      fillColor: "#63ddff",
      fillOpacity: 0.015,
      opacity: 0.95,
      weight: 3,
      dashArray: "10 7"
    };
  }

  if (status === "active") {
    return {
      color: "#ff5e78",
      fillColor: "#ff5e78",
      fillOpacity: 0.2,
      opacity: 1,
      weight: 3
    };
  }

  if (status === "inactive") {
    return {
      color: "#4fa8ff",
      fillColor: "#4fa8ff",
      fillOpacity: 0.05,
      opacity: 0.92,
      weight: 2
    };
  }

  return {
    color: "#ffb655",
    fillColor: "#ffb655",
    fillOpacity: 0.045,
    opacity: 0.95,
    weight: 2.5,
    dashArray: "8 7"
  };
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
  showZoneLabels = false
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
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      zoomControl
      attributionControl
      maxBounds={maxBounds}
      maxBoundsViscosity={lockBounds ? 1 : 0}
      minZoom={lockBounds ? 7 : 3}
      className="leaflet-map xavpac-modern-map"
    >
      <FitMap center={center} zoom={zoom} radiusKm={radiusKm} fixedBounds={fixedBounds} />

      <TileLayer
        attribution="&copy; OpenStreetMap &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {showRadius && radiusKm && (
        <Circle
          center={center}
          radius={radiusKm * 1000}
          pathOptions={{
            color: "#53cfff",
            weight: 2,
            opacity: 0.78,
            fillColor: "#53cfff",
            fillOpacity: 0.04,
            dashArray: "8 10"
          }}
        >
          <Tooltip permanent direction="right" className="radius-label">
            {radiusKm} km
          </Tooltip>
        </Circle>
      )}

      {zones.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.positions}
          pathOptions={zoneStyle(zone.status)}
        >
          {showZoneLabels && (
            <Tooltip permanent direction="center" className={`zone-label-v5 ${zone.status}`}>
              {zone.name}
            </Tooltip>
          )}
          <Popup>
            <div className="xavpac-popup">
              <strong>{zone.name}</strong>
              {zone.status !== "boundary" && (
                <span>
                  Statut : {zone.status === "active" ? "ACTIVE" : zone.status === "inactive" ? "INACTIVE" : "À VÉRIFIER SUR L’AZBA"}
                </span>
              )}
              <span>Plancher : {zone.floor}</span>
              <span>Plafond : {zone.ceiling}</span>
            </div>
          </Popup>
        </Polygon>
      ))}

      {trails.map((trail) => (
        <Polyline
          key={trail.id}
          positions={trail.positions}
          pathOptions={{
            color: trail.color ?? "#5bd8ff",
            weight: trail.selected ? 4 : 2,
            opacity: trail.selected ? 0.94 : 0.38,
            dashArray: trail.selected ? undefined : "7 9",
            lineCap: "round",
            lineJoin: "round"
          }}
        />
      ))}

      {points.map((point) => {
        const selected = point.id === selectedId;
        const faded = Boolean(selectedId) && !selected && point.category !== "home";
        return (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={pointIcon(point, selected, faded)}
            eventHandlers={{ click: () => onSelect?.(point.id) }}
          >
            <Popup>
              <div className="xavpac-popup">
                <strong>{point.name}</strong>
                <span>{point.detail}</span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
