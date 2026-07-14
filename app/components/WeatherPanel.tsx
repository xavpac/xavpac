"use client";

import { useEffect, useMemo, useState } from "react";

type CurrentWeather = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  cloud_cover: number;
  pressure_msl: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  wind_direction_10m: number;
};

type DailyWeather = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  wind_gusts_10m_max: number[];
  sunrise: string[];
  sunset: string[];
};

type WeatherResponse = {
  current: CurrentWeather;
  daily: DailyWeather;
  timezone_abbreviation: string;
};

const LATITUDE = 46.498;
const LONGITUDE = 5.298;

function weatherLabel(code: number) {
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Peu nuageux";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67].includes(code)) return "Pluie";
  if ([71, 73, 75, 77].includes(code)) return "Neige";
  if ([80, 81, 82].includes(code)) return "Averses";
  if ([95, 96, 99].includes(code)) return "Orages";
  return "Conditions variables";
}

function weatherIcon(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67].includes(code)) return "🌧️";
  if ([71, 73, 75, 77].includes(code)) return "🌨️";
  if ([80, 81, 82].includes(code)) return "🌦️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌥️";
}

function formatDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
}

function formatHour(value: string) {
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function WeatherPanel() {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const url = useMemo(() => {
    const params = new URLSearchParams({
      latitude: String(LATITUDE),
      longitude: String(LONGITUDE),
      timezone: "Europe/Paris",
      forecast_days: "7",
      current: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "wind_speed_10m",
        "wind_gusts_10m",
        "wind_direction_10m"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "wind_gusts_10m_max",
        "sunrise",
        "sunset"
      ].join(",")
    });

    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        setError("");
        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Réponse météo ${response.status}`);
        }

        const data = await response.json() as WeatherResponse;

        if (!cancelled) {
          setWeather(data);
          setUpdatedAt(
            new Date().toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
            })
          );
        }
      } catch {
        if (!cancelled) {
          setError("Impossible de charger les données météo en direct.");
        }
      }
    }

    loadWeather();
    const refresh = window.setInterval(loadWeather, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [url]);

  if (error) {
    return (
      <section className="hero">
        <div>
          <span className="eyebrow">MÉTÉO DOMMARTIN</span>
          <h1>Données indisponibles</h1>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (!weather) {
    return (
      <section className="hero">
        <div>
          <span className="eyebrow">MÉTÉO DOMMARTIN</span>
          <h1>Chargement des conditions locales…</h1>
          <p>Dommartin-lès-Cuiseaux • Saône-et-Loire</p>
        </div>
      </section>
    );
  }

  const current = weather.current;
  const todaySunrise = weather.daily.sunrise[0];
  const todaySunset = weather.daily.sunset[0];

  return (
    <>
      <section className="hero weather-hero">
        <div>
          <span className="eyebrow">MÉTÉO EN DIRECT</span>
          <h1>Dommartin-lès-Cuiseaux</h1>
          <p>Conditions locales et prévisions à sept jours.</p>
        </div>

        <div className="weather-now">
          <span>{weatherIcon(current.weather_code)}</span>
          <div>
            <strong>{Math.round(current.temperature_2m)} °C</strong>
            <small>{weatherLabel(current.weather_code)}</small>
          </div>
        </div>
      </section>

      <section className="weather-layout">
        <div className="weather-main">
          <article className="panel weather-summary">
            <div className="weather-temperature">
              <span className="weather-big-icon">{weatherIcon(current.weather_code)}</span>
              <div>
                <strong>{Math.round(current.temperature_2m)} °C</strong>
                <span>Ressenti {Math.round(current.apparent_temperature)} °C</span>
              </div>
            </div>

            <div className="weather-summary-text">
              <h3>{weatherLabel(current.weather_code)}</h3>
              <p>
                Vent moyen {Math.round(current.wind_speed_10m)} km/h,
                rafales {Math.round(current.wind_gusts_10m)} km/h.
                Humidité {Math.round(current.relative_humidity_2m)} %.
              </p>
            </div>
          </article>

          <section className="weather-metrics">
            <article className="panel"><span>💨 Vent</span><strong>{Math.round(current.wind_speed_10m)} km/h</strong></article>
            <article className="panel"><span>🌬️ Rafales</span><strong>{Math.round(current.wind_gusts_10m)} km/h</strong></article>
            <article className="panel"><span>🧭 Direction</span><strong>{Math.round(current.wind_direction_10m)}°</strong></article>
            <article className="panel"><span>💧 Humidité</span><strong>{Math.round(current.relative_humidity_2m)} %</strong></article>
            <article className="panel"><span>☁️ Nébulosité</span><strong>{Math.round(current.cloud_cover)} %</strong></article>
            <article className="panel"><span>🌧️ Précipitations</span><strong>{current.precipitation.toFixed(1)} mm</strong></article>
            <article className="panel"><span>🧭 Pression</span><strong>{Math.round(current.pressure_msl)} hPa</strong></article>
            <article className="panel"><span>🌡️ Ressenti</span><strong>{Math.round(current.apparent_temperature)} °C</strong></article>
          </section>

          <article className="panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">PRÉVISIONS</span>
                <h3>Les sept prochains jours</h3>
              </div>
            </div>

            <div className="forecast-grid">
              {weather.daily.time.map((day, index) => (
                <article key={day} className="forecast-day">
                  <strong>{formatDay(day)}</strong>
                  <span className="forecast-icon">{weatherIcon(weather.daily.weather_code[index])}</span>
                  <small>{weatherLabel(weather.daily.weather_code[index])}</small>
                  <div>
                    <b>{Math.round(weather.daily.temperature_2m_max[index])}°</b>
                    <span>{Math.round(weather.daily.temperature_2m_min[index])}°</span>
                  </div>
                  <small>Pluie {weather.daily.precipitation_probability_max[index]} %</small>
                  <small>Rafales {Math.round(weather.daily.wind_gusts_10m_max[index])} km/h</small>
                </article>
              ))}
            </div>
          </article>
        </div>

        <aside className="weather-side">
          <article className="panel">
            <span className="eyebrow">SOLEIL</span>
            <div className="info-list">
              <div><span>Lever</span><strong>{formatHour(todaySunrise)}</strong></div>
              <div><span>Coucher</span><strong>{formatHour(todaySunset)}</strong></div>
            </div>
          </article>

          <article className="panel">
            <span className="eyebrow">LOCALISATION</span>
            <div className="info-list">
              <div><span>Commune</span><strong>Dommartin-lès-Cuiseaux</strong></div>
              <div><span>Département</span><strong>Saône-et-Loire</strong></div>
              <div><span>Latitude</span><strong>46,498° N</strong></div>
              <div><span>Longitude</span><strong>5,298° E</strong></div>
            </div>
          </article>

          <article className="panel weather-update">
            <span className="eyebrow">MISE À JOUR</span>
            <h3>{updatedAt || "—"}</h3>
            <p className="muted">Actualisation automatique toutes les dix minutes.</p>
          </article>
        </aside>
      </section>
    </>
  );
}
