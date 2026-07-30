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

function formatHeading(value: number | null) {
  if (value === null) return "—";
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return `${Math.round(value)}° · ${labels[Math.round(value / 45) % 8]}`;
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

function MetricIcon({ kind }: { kind: "altitude" | "speed" | "heading" }) {
  const paths = {
    altitude: "M4 18h16M7 15l5-10 5 10M9 11h6",
    speed: "M4 17a8 8 0 1 1 16 0M12 17l5-6",
    heading: "M12 3l5 14-5-3-5 3 5-14Z"
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
  const aircraftPosition: [number, number] = [aircraft.latitude, aircraft.longitude];
  const mapPositions = observerPosition ? [observerPosition, aircraftPosition] : [aircraftPosition];
  const latitudes = mapPositions.map(([latitude]) => latitude);
  const longitudes = mapPositions.map(([, longitude]) => longitude);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const latitudePadding = Math.max(.025, (maximumLatitude - minimumLatitude) * .3);
  const longitudePadding = Math.max(.035, (maximumLongitude - minimumLongitude) * .3);
  const mapCenter: [number, number] = [(minimumLatitude + maximumLatitude) / 2, (minimumLongitude + maximumLongitude) / 2];
  const mapBounds: [[number, number], [number, number]] | undefined = mapPositions.length > 1
    ? [[minimumLatitude - latitudePadding, minimumLongitude - longitudePadding], [maximumLatitude + latitudePadding, maximumLongitude + longitudePadding]]
    : undefined;
  const direction = observerPosition ? bearingDegrees(observerPosition, [aircraft.latitude, aircraft.longitude]) : null;
  const directionLabels = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  const directionLabel = direction === null ? "Direction non déterminée" : directionLabels[Math.round(direction / 45) % 8];
  const mapPoints = [
    ...(observerPosition ? [{ id: "aircraft-view-home", lat: observerPosition[0], lon: observerPosition[1], name: "Chez moi", detail: "Position d’observation", category: "home" }] : []),
    { id: aircraft.id, lat: aircraft.latitude, lon: aircraft.longitude, name: flightLabel, detail: `${aircraft.distance.toFixed(1)} km • ${directionLabel}`, category: enriched?.aircraftCategory === "helicopter" ? "helicopter" : "commercial", heading: aircraft.trueTrack }
  ];
  const mapTrails = observerPosition
    ? [{ id: "aircraft-view-relative-track", positions: [observerPosition, aircraftPosition], color: "#45c8ff", selected: true }]
    : [];

  return <div ref={rootRef} className={`aircraft-view${open ? " open" : ""}`} aria-hidden={!open} aria-label="Vue plein écran de l’avion sélectionné">
    <div className="aircraft-view-hero">
      <div className="aircraft-view-terrain" />
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

      <div className="aircraft-view-photo-stage">
        <AircraftPhoto
          className="aircraft-view-focus-media"
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
      </div>

      <aside className={`aircraft-view-tower-panel${routeAvailable ? "" : " unavailable"}`} aria-label="Trajet et météo du vol">
        <header>
          <div><span>TRAJET DU VOL</span><strong>{routeStatus}</strong></div>
          {routeCalculation.progress !== null && <b>{Math.round(routeCalculation.progress)} %</b>}
        </header>

        <div className="aircraft-view-tower-airport origin">
          <span>DÉPART</span>
          <div className="aircraft-view-tower-city"><h3>{airportPlace(route?.origin, "Départ")}</h3><b>{airportCode(route?.origin)}</b></div>
          <div className="aircraft-view-tower-weather"><span>{weatherSymbol(route?.originWeather?.weather_code)}</span><strong>{route?.originWeather && typeof route.originWeather.temperature_2m === "number" ? `${Math.round(route.originWeather.temperature_2m)}°C` : "Météo —"}</strong>{route?.originWeather && typeof route.originWeather.wind_speed_10m === "number" && <small>Vent {Math.round(route.originWeather.wind_speed_10m)} km/h</small>}</div>
        </div>

        <div className="aircraft-view-tower-journey">
          <div className="aircraft-view-tower-line"><i style={{ height: `${routeCalculation.progress ?? 0}%` }} /><span style={{ top: `${routeCalculation.progress ?? 50}%` }}>✈</span></div>
          <div><strong>{routeAvailable ? "Vol en cours" : "Trajet non disponible"}</strong><small>{routeCalculation.remainingKm === null ? "Distance restante non calculable" : `${Math.round(routeCalculation.remainingKm)} km avant l’arrivée`}</small></div>
        </div>

        <div className="aircraft-view-tower-airport destination">
          <span>ARRIVÉE</span>
          <div className="aircraft-view-tower-city"><h3>{airportPlace(route?.destination, "Arrivée")}</h3><b>{airportCode(route?.destination)}</b></div>
          <div className="aircraft-view-tower-weather"><span>{weatherSymbol(route?.destinationWeather?.weather_code)}</span><strong>{route?.destinationWeather && typeof route.destinationWeather.temperature_2m === "number" ? `${Math.round(route.destinationWeather.temperature_2m)}°C` : "Météo —"}</strong>{route?.destinationWeather && typeof route.destinationWeather.wind_speed_10m === "number" && <small>Vent {Math.round(route.destinationWeather.wind_speed_10m)} km/h</small>}</div>
        </div>
      </aside>

      <aside className="aircraft-view-geo-panel">
        <header><div><span>CARTE DE PROXIMITÉ</span><strong>Votre position et l’avion</strong></div><button type="button" onClick={onShowMap}>Carte détaillée ›</button></header>
        <div className="aircraft-view-geo-canvas">
          <MiniMap points={mapPoints} trails={mapTrails} center={mapCenter} fixedBounds={mapBounds} selectedId={aircraft.id} mapVariant="dark" controls={false} />
        </div>
      </aside>

      <div className="aircraft-view-distance-callout">
        <span>OÙ REGARDER</span>
        <strong>{directionLabel}</strong>
        <small>{aircraft.distance.toFixed(1).replace(".", ",")} km de vous</small>
      </div>
    </div>

    <footer className="aircraft-view-footer">
      <div className="aircraft-view-metrics">
        <div><MetricIcon kind="altitude" /><span>Altitude<strong>{formatAltitude(aircraft.barometricAltitude)}</strong></span></div>
        <div><MetricIcon kind="speed" /><span>Vitesse<strong>{formatSpeed(aircraft.velocity)}</strong></span></div>
        <div><MetricIcon kind="heading" /><span>Cap<strong>{formatHeading(aircraft.trueTrack)}</strong></span></div>
      </div>
      <small className="aircraft-view-data-note">Données ADS-B en direct • la distance est calculée depuis votre position d’observation.</small>
    </footer>
  </div>;
}
