"use client";

import { FormEvent, useEffect, useState } from "react";

type PlaceWeather = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  temperature: number | null;
  apparentTemperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  visibility: number | null;
  weatherCode: number;
  icon: string;
  label: string;
};

type RouteSide = "departure" | "arrival";

type SavedRoute = {
  departure: string;
  arrival: string;
};

function visibilityText(value: number | null) {
  if (value === null) return "—";
  if (value >= 10000) return "> 10 km";
  return `${(value / 1000).toFixed(1)} km`;
}

export default function FlightRouteWeather({ flightKey }: { flightKey: string }) {
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [departureWeather, setDepartureWeather] = useState<PlaceWeather | null>(null);
  const [arrivalWeather, setArrivalWeather] = useState<PlaceWeather | null>(null);
  const [loading, setLoading] = useState<RouteSide | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDepartureWeather(null);
    setArrivalWeather(null);
    setError("");

    try {
      const raw = window.localStorage.getItem(`xavpac-route-${flightKey}`);
      if (!raw) {
        setDeparture("");
        setArrival("");
        return;
      }
      const saved = JSON.parse(raw) as SavedRoute;
      setDeparture(saved.departure ?? "");
      setArrival(saved.arrival ?? "");
    } catch {
      setDeparture("");
      setArrival("");
    }
  }, [flightKey]);

  function saveRoute(nextDeparture: string, nextArrival: string) {
    try {
      window.localStorage.setItem(
        `xavpac-route-${flightKey}`,
        JSON.stringify({ departure: nextDeparture, arrival: nextArrival })
      );
    } catch {
      // Le stockage local est facultatif.
    }
  }

  async function loadWeather(side: RouteSide) {
    const city = (side === "departure" ? departure : arrival).trim();
    if (!city) {
      setError(`Indiquez la ville ${side === "departure" ? "de départ" : "d’arrivée"}.`);
      return;
    }

    setLoading(side);
    setError("");

    try {
      const response = await fetch(`/api/place-weather?city=${encodeURIComponent(city)}`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok || !payload.weather) {
        throw new Error(payload.error ?? "Ville introuvable.");
      }

      if (side === "departure") {
        setDepartureWeather(payload.weather);
      } else {
        setArrivalWeather(payload.weather);
      }

      saveRoute(departure, arrival);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Météo indisponible.");
    } finally {
      setLoading(null);
    }
  }

  function submit(event: FormEvent, side: RouteSide) {
    event.preventDefault();
    void loadWeather(side);
  }

  function renderWeather(weather: PlaceWeather | null, side: RouteSide) {
    if (!weather) {
      return (
        <div className="fw-place-weather-empty">
          <span>{side === "departure" ? "🛫" : "🛬"}</span>
          <small>Renseignez une ville pour afficher sa météo.</small>
        </div>
      );
    }

    return (
      <div className="fw-place-weather-result">
        <div>
          <span>{weather.name}{weather.country ? ` • ${weather.country}` : ""}</span>
          <strong>{weather.icon} {weather.temperature === null ? "—" : `${Math.round(weather.temperature)}°C`}</strong>
          <small>{weather.label}</small>
        </div>
        <div>
          <span>Vent</span>
          <strong>{weather.windSpeed === null ? "—" : `${Math.round(weather.windSpeed)} kt`}</strong>
          <small>Visibilité {visibilityText(weather.visibility)}</small>
        </div>
      </div>
    );
  }

  return (
    <section className="fw-route-weather">
      <header>
        <div>
          <span>MÉTÉO DU TRAJET</span>
          <strong>Départ et arrivée</strong>
        </div>
        <small>Open-Meteo</small>
      </header>

      <div className="fw-route-weather-grid">
        <article>
          <span className="fw-route-label">Départ</span>
          <form onSubmit={(event) => submit(event, "departure")}>
            <input
              value={departure}
              onChange={(event) => {
                setDeparture(event.target.value);
                setDepartureWeather(null);
                saveRoute(event.target.value, arrival);
              }}
              placeholder="Ex. Lyon"
              aria-label="Ville de départ"
            />
            <button type="submit" disabled={loading === "departure"}>
              {loading === "departure" ? "…" : "Afficher"}
            </button>
          </form>
          {renderWeather(departureWeather, "departure")}
        </article>

        <div className="fw-route-weather-line" aria-hidden="true">✈︎ <i /> ✈︎</div>

        <article>
          <span className="fw-route-label">Arrivée</span>
          <form onSubmit={(event) => submit(event, "arrival")}>
            <input
              value={arrival}
              onChange={(event) => {
                setArrival(event.target.value);
                setArrivalWeather(null);
                saveRoute(departure, event.target.value);
              }}
              placeholder="Ex. Paris"
              aria-label="Ville d’arrivée"
            />
            <button type="submit" disabled={loading === "arrival"}>
              {loading === "arrival" ? "…" : "Afficher"}
            </button>
          </form>
          {renderWeather(arrivalWeather, "arrival")}
        </article>
      </div>

      {error && <p className="fw-route-weather-error">{error}</p>}
      <footer>La source ADS-B ne fournit pas toujours la route : les villes peuvent être saisies manuellement.</footer>
    </section>
  );
}
