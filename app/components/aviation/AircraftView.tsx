"use client";

import dynamic from "next/dynamic";
import type { RefObject } from "react";
import type { AircraftWithDistance } from "../../lib/aviation/liveAircraft";
import type { AirportIdentity, AirportWeather, EnrichedAircraft, RouteConfidence } from "../../lib/aviation/types";
import type { NearbyNationalAsset } from "../../lib/aviation/nationalAlerts";
import { bearingDegrees, distanceKm } from "../../lib/aviation/geometry";
import AircraftPhoto from "./AircraftPhoto";
import OperatorBrand from "./OperatorBrand";

const MiniMap = dynamic(() => import("../StableMap"), { ssr: false });

export type AircraftViewRoute = {
  origin: AirportIdentity;
  destination: AirportIdentity;
  originWeather: AirportWeather | null;
  destinationWeather: AirportWeather | null;
};

type Props = {
  open: boolean;
  rootRef: RefObject<HTMLDivElement>;
  aircraft: AircraftWithDistance;
  enriched: EnrichedAircraft | null;
  operator: string | null;
  route: AircraftViewRoute | null;
  routeConfidence: RouteConfidence;
  observerPosition: [number, number] | null;
  nationalAlert: NearbyNationalAsset | null;
  soundsEnabled: boolean;
  favorite: boolean;
  onClose: () => void;
  onShowMap: () => void;
  onToggleSounds: () => void;
  onToggleFavorite: () => void;
};

function airportCode(airport: AirportIdentity | null | undefined) {
  return airport?.iata ?? airport?.icao ?? "—";
}

function airportPlace(airport: AirportIdentity | null | undefined, fallback: string) {
  return airport?.municipality ?? airport?.name ?? fallback;
}

function validAirportPosition(airport: AirportIdentity | null | undefined): airport is AirportIdentity & { latitude: number; longitude: number } {
  return typeof airport?.latitude === "number" && Number.isFinite(airport.latitude)
    && typeof airport.longitude === "number" && Number.isFinite(airport.longitude);
}

function formatAltitude(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} m`;
}

function formatSpeed(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 3.6)} km/h`;
}

function calculateRoute(aircraft: AircraftWithDistance, route: AircraftViewRoute | null) {
  if (!route || !validAirportPosition(route.origin) || !validAirportPosition(route.destination)) {
    return { progress: null, remainingKm: null, eta: null };
  }
  const origin: [number, number] = [route.origin.latitude, route.origin.longitude];
  const destination: [number, number] = [route.destination.latitude, route.destination.longitude];
  const current: [number, number] = [aircraft.latitude, aircraft.longitude];
  const totalKm = distanceKm(origin, destination);
  const remainingKm = distanceKm(current, destination);
  const progress = totalKm > 1 ? Math.max(0, Math.min(100, (1 - remainingKm / totalKm) * 100)) : null;
  const eta = aircraft.velocity !== null && aircraft.velocity > 20
    ? new Date(Date.now() + (remainingKm * 1000 / aircraft.velocity) * 1000)
    : null;
  return { progress, remainingKm, eta };
}

function weatherSymbol(code: number | null | undefined) {
  if (code === null || code === undefined) return "◌";
  if (code === 0) return "☀";
  if (code <= 3) return "🌤";
  if (code >= 95) return "⛈";
  if (code >= 71) return "❄";
  if (code >= 51) return "🌧";
  return "☁";
}

function MetricIcon({ kind }: { kind: "altitude" | "speed" | "eta" }) {
  const paths = {
    altitude: "M4 18h16M7 15l5-10 5 10M9 11h6",
    speed: "M4 17a8 8 0 1 1 16 0M12 17l5-6",
    eta: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2"
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export default function AircraftView({ open, rootRef, aircraft, enriched, operator, route, routeConfidence, observerPosition, nationalAlert, soundsEnabled, favorite, onClose, onShowMap, onToggleSounds, onToggleFavorite }: Props) {
  const routeCalculation = calculateRoute(aircraft, route);
  const flightLabel = enriched?.flightNumberIata ?? enriched?.callsignIcao ?? enriched?.rawCallsign ?? aircraft.callsign;
  const aircraftType = enriched?.aircraftType ?? aircraft.aircraftType ?? aircraft.description ?? "Type non disponible";
  const status = aircraft.onGround ? "Au sol" : "En vol";
  const routeAvailable = Boolean(route);
  const routeStatus = routeConfidence === "confirmed" ? "Itinéraire confirmé" : routeConfidence === "probable" ? "Vol sur l’itinéraire probable" : routeConfidence === "inferred" ? "Itinéraire déduit" : "Itinéraire indisponible";
  const etaLabel = routeCalculation.eta
    ? routeCalculation.eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const mapCenter: [number, number] = observerPosition
    ? [(observerPosition[0] + aircraft.latitude) / 2, (observerPosition[1] + aircraft.longitude) / 2]
    : [aircraft.latitude, aircraft.longitude];
  const mapBounds: [[number, number], [number, number]] | undefined = observerPosition
    ? [
      [Math.min(observerPosition[0], aircraft.latitude) - .012, Math.min(observerPosition[1], aircraft.longitude) - .012],
      [Math.max(observerPosition[0], aircraft.latitude) + .012, Math.max(observerPosition[1], aircraft.longitude) + .012]
    ]
    : undefined;
  const direction = observerPosition ? bearingDegrees(observerPosition, [aircraft.latitude, aircraft.longitude]) : null;
  const directionLabels = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  const directionLabel = direction === null ? "Direction non déterminée" : directionLabels[Math.round(direction / 45) % 8];
  const mapPoints = [
    ...(observerPosition ? [{ id: "aircraft-view-home", lat: observerPosition[0], lon: observerPosition[1], name: "Chez moi", detail: "Position d’observation", category: "home" }] : []),
    { id: aircraft.id, lat: aircraft.latitude, lon: aircraft.longitude, name: flightLabel, detail: `${aircraft.distance.toFixed(1)} km • ${directionLabel}`, category: "commercial", heading: aircraft.trueTrack }
  ];

  return <div ref={rootRef} className={`aircraft-view${open ? " open" : ""}`} aria-hidden={!open} aria-label="Vue plein écran de l’avion sélectionné">
    <div className="aircraft-view-hero">
      <AircraftPhoto
        className="aircraft-view-hero-media"
        identityKey={aircraft.id}
        photoUrl={enriched?.photo.url}
        isExact={enriched?.photo.kind === "exact"}
        label={enriched?.photo.label}
        source={enriched?.photo.source}
        photographer={enriched?.photo.photographer}
        aircraftType={enriched?.aircraftType ?? aircraft.aircraftType}
        description={aircraft.description}
        operator={operator}
        category={aircraft.category}
      />
      <div className="aircraft-view-shade" />

      <header className="aircraft-view-header">
        <div className="aircraft-view-title">
          <button type="button" onClick={onClose} aria-label="Fermer la Vue avion">←</button>
          <div><div><h2>{flightLabel}</h2><span className="aircraft-view-live-dot" /><b>{status}</b><em>Le plus proche</em></div><p>{aircraftType}</p></div>
        </div>
        <div className="aircraft-view-company">
          <OperatorBrand name={operator} logoUrl={enriched?.logo} />
          <button type="button" className={`aircraft-view-sound-button${soundsEnabled ? " active" : ""}`} onClick={onToggleSounds} aria-label={soundsEnabled ? "Couper les sons" : "Activer les sons"}>{soundsEnabled ? "🔊" : "🔇"}</button>
          <button type="button" className={favorite ? "active" : ""} onClick={onToggleFavorite} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>☆</button>
        </div>
      </header>

      {nationalAlert && <div className="aircraft-view-national-alert"><span>ALERTE MOYEN NATIONAL</span><strong>{nationalAlert.badge} • {nationalAlert.callsign}</strong><b>{Math.round(nationalAlert.distanceKm)} km de votre position</b></div>}

      <aside className="aircraft-view-mini-map">
        <header><div><span>OÙ EST L’AVION ?</span><strong>{aircraft.distance.toFixed(1)} km • {directionLabel}</strong></div><button type="button" onClick={onShowMap}>Carte ›</button></header>
        <div className="aircraft-view-mini-map-canvas">
          <MiniMap points={mapPoints} center={mapCenter} fixedBounds={mapBounds} selectedId={aircraft.id} mapVariant="dark" controls={false} />
        </div>
      </aside>

      <div className={`aircraft-view-route${routeAvailable ? "" : " unavailable"}`}>
        <div className="aircraft-view-airport origin">
          <span className="aircraft-view-airport-icon" aria-hidden="true">↗</span>
          <div><strong>{airportPlace(route?.origin, "Départ")}</strong><b>{airportCode(route?.origin)}</b><small>{route?.originWeather && typeof route.originWeather.temperature_2m === "number" ? `${weatherSymbol(route.originWeather.weather_code)} ${Math.round(route.originWeather.temperature_2m)}°C` : "Météo —"}</small></div>
        </div>
        <div className="aircraft-view-track">
          <div className="aircraft-view-track-line"><i style={{ width: `${routeCalculation.progress ?? 0}%` }} /><span style={{ left: `${routeCalculation.progress ?? 50}%` }}>✈</span></div>
          <strong>{routeStatus}</strong>
          <small>{routeCalculation.progress === null ? "Position sur le trajet non calculable" : `${Math.round(routeCalculation.progress)} % du trajet estimé`}</small>
        </div>
        <div className="aircraft-view-airport destination">
          <div><strong>{airportPlace(route?.destination, "Arrivée")}</strong><b>{airportCode(route?.destination)}</b><small>{route?.destinationWeather && typeof route.destinationWeather.temperature_2m === "number" ? `${weatherSymbol(route.destinationWeather.weather_code)} ${Math.round(route.destinationWeather.temperature_2m)}°C` : "Météo —"}</small></div>
          <span className="aircraft-view-airport-icon" aria-hidden="true">↘</span>
        </div>
      </div>
    </div>

    <footer className="aircraft-view-footer">
      <div className="aircraft-view-metrics">
        <div><MetricIcon kind="altitude" /><span>Altitude<strong>{formatAltitude(aircraft.barometricAltitude)}</strong></span></div>
        <div><MetricIcon kind="speed" /><span>Vitesse<strong>{formatSpeed(aircraft.velocity)}</strong></span></div>
        <div><MetricIcon kind="eta" /><span>ETA estimée<strong>{etaLabel}</strong></span></div>
      </div>
      <small className="aircraft-view-data-note">Données ADS-B en direct • les distances et l’ETA sont calculées à partir de la position et de la vitesse sol actuelles.</small>
    </footer>
  </div>;
}
