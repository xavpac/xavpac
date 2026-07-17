"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Aircraft, GeoPosition } from "../types";
import { altitudeLabel } from "../data/aircraft";

const DEFAULT_CENTER: [number, number] = [46.30063, 5.1154];

type FlightMapProps = {
  aircraft: Aircraft[];
  selectedId: string | null;
  onSelect: (aircraft: Aircraft) => void;
  position: GeoPosition | null;
  showTraces: boolean;
  showCircles: boolean;
};

function markerHtml(aircraft: Aircraft, selected: boolean) {
  const angle = aircraft.trackDeg ?? 0;
  const roleClass = aircraft.category === "airliner" ? "civil" : "national";
  return `
    <div class="map-aircraft ${selected ? "is-selected" : ""} ${roleClass}">
      <div class="map-aircraft-plane" style="transform: rotate(${angle}deg)">✈</div>
      <div class="map-aircraft-label">
        <strong>${aircraft.callsign || aircraft.registration || aircraft.hex}</strong>
        <span>${aircraft.type || "—"} · ${altitudeLabel(aircraft.altitudeFt)}</span>
        <span>${aircraft.groundSpeedKt ? `${Math.round(aircraft.groundSpeedKt)} kts` : "vitesse —"}</span>
      </div>
    </div>
  `;
}

export default function FlightMap({
  aircraft,
  selectedId,
  onSelect,
  position,
  showTraces,
  showCircles,
}: FlightMapProps) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const center = useMemo<[number, number]>(() => {
    if (position) return [position.latitude, position.longitude];
    return DEFAULT_CENTER;
  }, [position]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let map: import("leaflet").Map | undefined;

    async function initialise() {
      if (!mapHostRef.current) return;
      const LeafletModule = await import("leaflet");
      const L = LeafletModule.default;
      if (disposed || !mapHostRef.current) return;

      map = L.map(mapHostRef.current, {
        center,
        zoom: 8,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap &copy; CARTO",
      }).addTo(map);

      L.control.zoom({ position: "topleft" }).addTo(map);

      if (showCircles) {
        [25000, 50000, 100000].forEach((radius, index) => {
          L.circle(center, {
            radius,
            color: index === 0 ? "#27d7ff" : "#477bff",
            weight: 1,
            opacity: 0.35,
            fillOpacity: 0.015,
            dashArray: "4 8",
          }).addTo(map!);
        });
      }

      if (position) {
        const homeIcon = L.divIcon({
          className: "home-pin-wrapper",
          html: `<div class="home-pin" title="Ma position">📍</div>`,
          iconSize: [36, 42],
          iconAnchor: [18, 39],
        });
        L.marker([position.latitude, position.longitude], {
          icon: homeIcon,
          zIndexOffset: 1500,
        })
          .addTo(map)
          .bindTooltip(`Position GPS · précision ${Math.round(position.accuracy)} m`, {
            direction: "top",
            offset: [0, -28],
          });
      }

      aircraft.forEach((item) => {
        const selected = item.id === selectedId;
        const icon = L.divIcon({
          className: "aircraft-marker-wrapper",
          html: markerHtml(item, selected),
          iconSize: selected ? [152, 88] : [126, 76],
          iconAnchor: selected ? [30, 38] : [24, 33],
        });
        const marker = L.marker([item.latitude, item.longitude], {
          icon,
          zIndexOffset: selected ? 1200 : 500,
        }).addTo(map!);
        marker.on("click", () => onSelectRef.current(item));
      });

      const selected = aircraft.find((item) => item.id === selectedId);
      if (selected && showTraces) {
        const bearing = ((selected.trackDeg ?? 0) * Math.PI) / 180;
        const traceLength = 0.7;
        const lat2 = selected.latitude - Math.cos(bearing) * traceLength;
        const lon2 = selected.longitude - Math.sin(bearing) * traceLength;
        L.polyline(
          [
            [lat2, lon2],
            [selected.latitude, selected.longitude],
          ],
          {
            color: "#b74cff",
            weight: 2,
            opacity: 0.85,
            dashArray: "8 8",
          },
        ).addTo(map);
      }

      const validPoints: [number, number][] = aircraft.map((item) => [item.latitude, item.longitude]);
      if (position) validPoints.push([position.latitude, position.longitude]);
      if (validPoints.length > 1) {
        map.fitBounds(L.latLngBounds(validPoints), {
          paddingTopLeft: [70, 60],
          paddingBottomRight: [60, 60],
          maxZoom: 9,
          animate: false,
        });
      }

      resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(() => map?.invalidateSize(false));
      });
      resizeObserver.observe(mapHostRef.current);
      window.setTimeout(() => map?.invalidateSize(false), 120);
    }

    initialise();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [aircraft, center, position, selectedId, showCircles, showTraces]);

  return <div className="flight-map" ref={mapHostRef} aria-label="Carte du trafic aérien" />;
}
