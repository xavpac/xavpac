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
  category?: "home" | "aircraft" | "helicopter" | "warning" | string;
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
  status: "active" | "inactive" | "unknown";
  floor: string;
  ceiling: string;
  positions: [number, number][];
};

function FitMap({
  center,
  zoom,
  radiusKm
}: {
  center: [number, number];
  zoom: number;
  radiusKm?: number;
}) {
  const map = useMap();

  useEffect(() => {
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
  }, [center, map, radiusKm, zoom]);

  return null;
}

function aircraftSvg(color: string, heading: number, helicopter = false) {
  if (helicopter) {
    return `
      <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
        <path d="M11 31h22c8 0 14 4 17 11H29c-7 0-13-4-18-11Z" fill="${color}" stroke="white" stroke-width="1.6"/>
        <path d="M35 21h3v14h-3zM19 23h33v2H19zM46 39l11 8-2 2-14-7z" fill="${color}" stroke="white" stroke-width="1"/>
        <circle cx="24" cy="45" r="3" fill="${color}" stroke="white" stroke-width="1.5"/>
        <circle cx="43" cy="45" r="3" fill="${color}" stroke="white" stroke-width="1.5"/>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M31.8 4.5c2 0 3.5 1.8 3.5 4.2v15.1L53 34.2c1.4.8 2.3 2.2 2.3 3.8v3.6l-20-6.2v12.2l6.6 4.1v3.2l-10.1-2.6-10.1 2.6v-3.2l6.6-4.1V35.4l-20 6.2V38c0-1.6.9-3 2.3-3.8l17.7-10.4V8.7c0-2.4 1.5-4.2 3.5-4.2Z" fill="${color}" stroke="white" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`;
}

function homeIcon() {
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-home-marker"><span class="xavpac-home-core"></span><span class="xavpac-home-ring"></span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16]
  });
}

function pointIcon(point: MapPoint, selected: boolean, faded: boolean) {
  if (point.category === "home") return homeIcon();

  const color = selected ? "#63ddff" : point.color ?? "#8aa1b7";
  const helicopter = point.category === "helicopter";
  const heading = typeof point.heading === "number" ? point.heading : 0;

  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `
      <div class="xavpac-aircraft-marker ${selected ? "is-selected" : ""} ${faded ? "is-faded" : ""}">
        <div class="xavpac-aircraft-svg">${aircraftSvg(color, heading, helicopter)}</div>
        <div class="xavpac-aircraft-label">${point.name}</div>
      </div>`,
    iconSize: [76, 58],
    iconAnchor: [38, 29],
    popupAnchor: [0, -26]
  });
}

function zoneStyle(status: MapZone["status"]) {
  if (status === "active") {
    return {
      color: "#ff5e78",
      fillColor: "#ff5e78",
      fillOpacity: 0.18,
      opacity: 1,
      weight: 3
    };
  }

  if (status === "inactive") {
    return {
      color: "#ffb655",
      fillColor: "#ffb655",
      fillOpacity: 0.045,
      opacity: 0.88,
      weight: 2
    };
  }

  return {
    color: "#9aa9ba",
    fillColor: "#9aa9ba",
    fillOpacity: 0.025,
    opacity: 0.75,
    weight: 2,
    dashArray: "8 8"
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
  onSelect
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
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      zoomControl
      attributionControl
      className="leaflet-map xavpac-modern-map"
    >
      <FitMap center={center} zoom={zoom} radiusKm={radiusKm} />

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
            opacity: 0.72,
            fillColor: "#53cfff",
            fillOpacity: 0.035,
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
          <Popup>
            <div className="xavpac-popup">
              <strong>{zone.name}</strong>
              <span>
                Statut : {zone.status === "active" ? "ACTIVE" : zone.status === "inactive" ? "INACTIVE" : "À VÉRIFIER"}
              </span>
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
            opacity: trail.selected ? 0.92 : 0.32,
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
