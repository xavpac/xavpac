"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  Circle,
  LayersControl,
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
type MapVariant = "layers" | "street" | "satellite" | "dark";

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
      const longitudeDelta = radiusKm / (111 * Math.max(Math.cos((center[0] * Math.PI) / 180), 0.25));
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
        <path d="M8 30h26c9 0 15 5 18 13H28c-8 0-14-5-20-13Z" fill="${color}" stroke="#07111d" stroke-width="2.6"/>
        <path d="M36 18h4v18h-4zM16 21h40v3H16zM47 40l12 9-3 3-16-9z" fill="${color}" stroke="#07111d" stroke-width="1.6"/>
        <circle cx="23" cy="47" r="3.5" fill="${color}" stroke="#07111d" stroke-width="2"/>
        <circle cx="44" cy="47" r="3.5" fill="${color}" stroke="#07111d" stroke-width="2"/>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M31.8 3.2c2.5 0 4.2 2.1 4.2 5v14.9L55 34.3c1.7 1 2.7 2.6 2.7 4.4v4.2L36 36.3v11.3l7.2 4.5v3.8l-11.4-3-11.4 3v-3.8l7.2-4.5V36.3L6 42.9v-4.2c0-1.8 1-3.4 2.7-4.4l18.9-11.2V8.2c0-2.9 1.7-5 4.2-5Z" fill="${color}" stroke="#07111d" stroke-width="2.8" stroke-linejoin="round"/>
    </svg>`;
}

function homeIcon() {
  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `<div class="xavpac-home-marker"><span class="xavpac-home-core"></span><span class="xavpac-home-ring"></span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20]
  });
}

function pointIcon(point: MapPoint, selected: boolean, faded: boolean) {
  if (point.category === "home") return homeIcon();

  const color = selected ? "#00b7ff" : point.color ?? "#ff9f1c";
  const helicopter = point.category === "helicopter";
  const heading = typeof point.heading === "number" ? point.heading : 0;

  return L.divIcon({
    className: "xavpac-map-icon-root",
    html: `
      <div class="xavpac-aircraft-marker ${selected ? "is-selected" : ""} ${faded ? "is-faded" : ""}">
        <div class="xavpac-aircraft-svg">${aircraftSvg(color, heading, helicopter)}</div>
        <div class="xavpac-aircraft-label">${point.name || "ADS-B"}</div>
      </div>`,
    iconSize: [126, 96],
    iconAnchor: [63, 48],
    popupAnchor: [0, -42]
  });
}

function zoneStyle(status: MapZone["status"]) {
  if (status === "boundary") {
    return { color: "#0089c9", fillColor: "#0089c9", fillOpacity: 0.015, opacity: 0.95, weight: 3, dashArray: "10 7" };
  }
  if (status === "active") {
    return { color: "#d51f3b", fillColor: "#ef334f", fillOpacity: 0.30, opacity: 1, weight: 3.5 };
  }
  if (status === "inactive") {
    return { color: "#1769d2", fillColor: "#2f80ed", fillOpacity: 0.17, opacity: 0.96, weight: 2.8 };
  }
  return { color: "#536f8a", fillColor: "#7b93aa", fillOpacity: 0.10, opacity: 0.95, weight: 2.5, dashArray: "8 7" };
}

function BaseLayers({ variant }: { variant: MapVariant }) {
  if (variant === "street") {
    return <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />;
  }
  if (variant === "satellite") {
    return <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />;
  }
  if (variant === "dark") {
    return <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />;
  }

  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Plan lisible">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Mode sombre">
        <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
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
  mapVariant = "layers"
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
      preferCanvas
      className="leaflet-map xavpac-modern-map xavpac-readable-map"
    >
      <FitMap center={center} zoom={zoom} radiusKm={radiusKm} fixedBounds={fixedBounds} />
      <BaseLayers variant={mapVariant} />

      {showRadius && radiusKm && (
        <Circle
          center={center}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#008fd3", weight: 3, opacity: 0.9, fillColor: "#58c9ff", fillOpacity: 0.08, dashArray: "9 8" }}
        >
          <Tooltip permanent direction="right" className="radius-label">{radiusKm} km</Tooltip>
        </Circle>
      )}

      {zones.map((zone) => (
        <Polygon key={zone.id} positions={zone.positions} pathOptions={zoneStyle(zone.status)}>
          {showZoneLabels && (
            <Tooltip permanent direction="center" className={`zone-label-v5 ${zone.status}`}>{zone.name}</Tooltip>
          )}
          <Popup>
            <div className="xavpac-popup">
              <strong>{zone.name}</strong>
              {zone.status !== "boundary" && (
                <span>Statut : {zone.status === "active" ? "ACTIVE" : zone.status === "inactive" ? "INACTIVE" : "NON DISPONIBLE — vérifier AZBA"}</span>
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
            color: trail.color ?? "#008fd3",
            weight: trail.selected ? 5 : 3,
            opacity: trail.selected ? 0.96 : 0.54,
            dashArray: trail.selected ? undefined : "7 8",
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
            zIndexOffset={selected ? 1200 : point.category === "home" ? 1100 : 0}
            eventHandlers={{ click: () => onSelect?.(point.id) }}
          >
            <Popup>
              <div className="xavpac-popup"><strong>{point.name}</strong><span>{point.detail}</span></div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
