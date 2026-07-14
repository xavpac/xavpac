"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  useMap
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  detail: string;
  color: string;
  icon?: string;
  category?: string;
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

function FlyTo({
  lat,
  lon,
  zoom,
  radiusKm
}: {
  lat: number;
  lon: number;
  zoom: number;
  radiusKm?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (radiusKm) {
      const latitudeDelta = radiusKm / 111;
      const longitudeDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

      map.fitBounds(
        [
          [lat - latitudeDelta, lon - longitudeDelta],
          [lat + latitudeDelta, lon + longitudeDelta]
        ],
        {
          padding: [18, 18],
          animate: true,
          duration: 0.7
        }
      );
      return;
    }

    map.flyTo([lat, lon], zoom, { duration: 0.7 });
  }, [lat, lon, map, radiusKm, zoom]);

  return null;
}

function markerIcon(point: MapPoint, selected: boolean, faded: boolean) {
  const label = point.category === "home"
    ? ""
    : `<div class="xavpac-marker-label">${point.name}</div>`;

  return L.divIcon({
    className: "xavpac-marker-wrapper",
    html: `
      <div class="xavpac-marker ${selected ? "selected" : ""} ${faded ? "faded" : ""}">
        <div class="xavpac-marker-icon ${point.category === "home" ? "home-pin" : "aircraft-silhouette"}"
             style="--marker-color:${selected ? "#5fd2ff" : point.color}">
          <span>${point.icon ?? "✈"}</span>
        </div>
        ${label}
      </div>
    `,
    iconSize: [54, 42],
    iconAnchor: [27, 21],
    popupAnchor: [0, -22]
  });
}

function zoneStyle(status: MapZone["status"]) {
  if (status === "active") {
    return {
      color: "#ff4c64",
      fillColor: "#ff4c64",
      fillOpacity: 0.20,
      weight: 3
    };
  }

  if (status === "inactive") {
    return {
      color: "#ffab4d",
      fillColor: "#ffab4d",
      fillOpacity: 0.055,
      weight: 2
    };
  }

  return {
    color: "#8b98a8",
    fillColor: "#8b98a8",
    fillOpacity: 0.035,
    weight: 2,
    dashArray: "6 6"
  };
}

export default function StableMap({
  points,
  center,
  zoom = 7,
  selectedId,
  trails = [],
  zones = [],
  radiusKm
}: {
  points: MapPoint[];
  center: [number, number];
  zoom?: number;
  selectedId?: string;
  trails?: MapTrail[];
  zones?: MapZone[];
  radiusKm?: number;
}) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom className="leaflet-map">
      <FlyTo lat={center[0]} lon={center[1]} zoom={zoom} radiusKm={radiusKm} />

      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {zones.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.positions}
          pathOptions={zoneStyle(zone.status)}
        >
          <Popup>
            <strong>{zone.name}</strong><br />
            Statut : {zone.status === "active" ? "ACTIVE" : zone.status === "inactive" ? "INACTIVE" : "NON VÉRIFIÉ"}<br />
            Plancher : {zone.floor}<br />
            Plafond : {zone.ceiling}
          </Popup>
        </Polygon>
      ))}

      {trails.map((trail) => (
        <Polyline
          key={trail.id}
          positions={trail.positions}
          pathOptions={{
            color: trail.color ?? "#65c8ff",
            weight: trail.selected ? 4 : 2,
            opacity: trail.selected ? 0.9 : 0.45,
            dashArray: trail.selected ? undefined : "5 6"
          }}
        />
      ))}

      {points.map((point) => {
        const selected = point.id === selectedId;
        const faded = Boolean(selectedId) && !selected;

        return (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={markerIcon(point, selected, faded)}
          >
            <Popup>
              <strong>{point.icon ?? "✈️"} {point.name}</strong><br />
              {point.detail}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
