"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

type AirportWeather = {
  temperature: number;
  wind: number;
  code: number;
};

type LiveAircraft = {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  barometricAltitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  onGround: boolean;
};

type AirportReport = {
  icaoId?: string;
  rawOb?: string;
  rawTAF?: string;
  reportTime?: string;
  flightCategory?: string;
};

const flights = [
  {
    id: "EZY72MB",
    type: "Airbus A320-214",
    company: "easyJet",
    registration: "G-EZRT",
    route: "BHX → RHO",
    distance: "19,0 km",
    altitude: "9 450 m",
    speed: "835 km/h",
    bearing: "122°",
    direction: "Nord-Est",
    height: "31°",
    departure: {
      code: "BHX",
      icao: "EGBB",
      city: "Birmingham",
      airport: "Birmingham Airport",
      lat: 52.4539,
      lon: -1.7480
    },
    arrival: {
      code: "RHO",
      icao: "LGRP",
      city: "Rhodes",
      airport: "Rhodes International Airport",
      lat: 36.4054,
      lon: 28.0862
    }
  },
  {
    id: "AFR1542",
    type: "Airbus A320",
    company: "Air France",
    registration: "F-HBNJ",
    route: "LYS → CDG",
    distance: "24,8 km",
    altitude: "10 200 m",
    speed: "812 km/h",
    bearing: "047°",
    direction: "Est",
    height: "28°",
    departure: { code: "LYS", city: "Lyon", airport: "Lyon-Saint-Exupéry", lat: 45.7256, lon: 5.0811 },
    arrival: { code: "CDG", city: "Paris", airport: "Paris-Charles-de-Gaulle", lat: 49.0097, lon: 2.5479 }
  },
  {
    id: "EJU4019",
    type: "Airbus A320neo",
    company: "easyJet",
    registration: "OE-LSM",
    route: "GVA → NTE",
    distance: "31,4 km",
    altitude: "10 650 m",
    speed: "802 km/h",
    bearing: "281°",
    direction: "Ouest",
    height: "24°",
    departure: { code: "GVA", city: "Genève", airport: "Aéroport de Genève", lat: 46.2381, lon: 6.1089 },
    arrival: { code: "NTE", city: "Nantes", airport: "Nantes Atlantique", lat: 47.1532, lon: -1.6107 }
  },
  {
    id: "RYR83CN",
    type: "Boeing 737-800",
    company: "Ryanair",
    registration: "EI-DCL",
    route: "MXP → STN",
    distance: "43,1 km",
    altitude: "11 000 m",
    speed: "844 km/h",
    bearing: "318°",
    direction: "Nord-Ouest",
    height: "20°",
    departure: { code: "MXP", city: "Milan", airport: "Milan Malpensa", lat: 45.6306, lon: 8.7281 },
    arrival: { code: "STN", city: "Londres", airport: "London Stansted", lat: 51.8850, lon: 0.2350 }
  },
  {
    id: "SWR218",
    type: "Airbus A220-300",
    company: "Swiss",
    registration: "HB-JCF",
    route: "ZRH → BOD",
    distance: "49,6 km",
    altitude: "10 350 m",
    speed: "790 km/h",
    bearing: "265°",
    direction: "Ouest",
    height: "18°",
    departure: { code: "ZRH", city: "Zurich", airport: "Aéroport de Zurich", lat: 47.4581, lon: 8.5555 },
    arrival: { code: "BOD", city: "Bordeaux", airport: "Bordeaux-Mérignac", lat: 44.8283, lon: -0.7156 }
  }
];

function formatCounter(value: number) {
  const total = Math.abs(value);
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function weatherIcon(code?: number) {
  if (code === undefined) return "🌤️";
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌥️";
}

function weatherLabel(code?: number) {
  if (code === undefined) return "Chargement";
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Peu nuageux";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Pluie";
  if ([71, 73, 75, 77].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orages";
  return "Variable";
}

async function getAirportWeather(lat: number, lon: number): Promise<AirportWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,wind_speed_10m,weather_code",
    timezone: "auto"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Météo indisponible");
  }

  const data = await response.json();

  return {
    temperature: data.current.temperature_2m,
    wind: data.current.wind_speed_10m,
    code: data.current.weather_code
  };
}


function distanceKm(
  origin: [number, number],
  destination: [number, number]
) {
  const [lat1, lon1] = origin.map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = destination.map((value) => (value * Math.PI) / 180);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortReport(value?: string) {
  if (!value) return "Non disponible";
  return value.length > 135 ? `${value.slice(0, 132)}…` : value;
}

export default function AviationPanel() {
  const nearest = flights[0];
  const passageDelay = useMemo(() => 135_000, []);
  const [passageTime, setPassageTime] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [departureWeather, setDepartureWeather] = useState<AirportWeather | null>(null);
  const [arrivalWeather, setArrivalWeather] = useState<AirportWeather | null>(null);
  const [userPosition, setUserPosition] = useState<[number, number]>([46.346, 4.977]);
  const [locationStatus, setLocationStatus] = useState("Position de référence");
  const [liveAircraft, setLiveAircraft] = useState<LiveAircraft[]>([]);
  const [aircraftSourceStatus, setAircraftSourceStatus] = useState("Connexion OpenSky…");
  const [selectedLiveId, setSelectedLiveId] = useState<string | undefined>();
  const [liveTrail, setLiveTrail] = useState<[number, number][]>([]);
  const [metarReports, setMetarReports] = useState<AirportReport[]>([]);
  const [tafReports, setTafReports] = useState<AirportReport[]>([]);

  useEffect(() => {
    const initialNow = Date.now();
    setPassageTime(initialNow + passageDelay);
    setNow(initialNow);

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [passageDelay]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Géolocalisation indisponible");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.latitude, position.coords.longitude]);
        setLocationStatus(`Position GPS • précision ±${Math.round(position.coords.accuracy)} m`);
      },
      () => {
        setLocationStatus("Position de référence utilisée");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAircraft() {
      try {
        const response = await fetch(
          `/api/aircraft?lat=${userPosition[0]}&lon=${userPosition[1]}&radius=20`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (cancelled) return;

        const sorted = (Array.isArray(data.aircraft) ? data.aircraft : [])
          .map((aircraft: LiveAircraft) => ({
            ...aircraft,
            distance: distanceKm(userPosition, [
              aircraft.latitude,
              aircraft.longitude
            ])
          }))
          .sort(
            (first: LiveAircraft & { distance: number }, second: LiveAircraft & { distance: number }) =>
              first.distance - second.distance
          );

        setLiveAircraft(sorted);
        setAircraftSourceStatus(
          response.ok
            ? `OpenSky connecté • ${sorted.length} appareil${sorted.length > 1 ? "s" : ""}`
            : "OpenSky momentanément indisponible"
        );

        const closest = sorted[0];
        if (closest) {
          setSelectedLiveId(closest.id);
          setLiveTrail((previous) => {
            const next = [...previous, [closest.latitude, closest.longitude] as [number, number]];
            return next.slice(-20);
          });
        }
      } catch {
        if (!cancelled) {
          setAircraftSourceStatus("OpenSky momentanément indisponible");
        }
      }
    }

    loadAircraft();
    const refresh = window.setInterval(loadAircraft, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [userPosition]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        const response = await fetch(
          `/api/airport-weather?ids=${nearest.departure.icao},${nearest.arrival.icao}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!cancelled) {
          setMetarReports(Array.isArray(data.metar) ? data.metar : []);
          setTafReports(Array.isArray(data.taf) ? data.taf : []);
        }
      } catch {
        if (!cancelled) {
          setMetarReports([]);
          setTafReports([]);
        }
      }
    }

    loadReports();
    const refresh = window.setInterval(loadReports, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [nearest.arrival.icao, nearest.departure.icao]);

  useEffect(() => {
    let cancelled = false;

    async function loadAirportWeather() {
      try {
        const [departure, arrival] = await Promise.all([
          getAirportWeather(nearest.departure.lat, nearest.departure.lon),
          getAirportWeather(nearest.arrival.lat, nearest.arrival.lon)
        ]);

        if (!cancelled) {
          setDepartureWeather(departure);
          setArrivalWeather(arrival);
        }
      } catch {
        if (!cancelled) {
          setDepartureWeather(null);
          setArrivalWeather(null);
        }
      }
    }

    loadAirportWeather();
    const refresh = window.setInterval(loadAirportWeather, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [nearest.arrival.lat, nearest.arrival.lon, nearest.departure.lat, nearest.departure.lon]);

  const deltaSeconds =
    passageTime !== null && now !== null
      ? Math.round((passageTime - now) / 1000)
      : null;

  const counterLabel =
    deltaSeconds === null
      ? "Calcul du passage"
      : deltaSeconds >= 0
        ? "Passage dans"
        : "Passé depuis";

  const counter = deltaSeconds === null ? "--:--" : formatCounter(deltaSeconds);

  const localTime =
    passageTime === null
      ? "--:--:--"
      : new Date(passageTime).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });

  const progress =
    deltaSeconds === null
      ? 5
      : Math.max(5, Math.min(95, 50 - deltaSeconds / 4));

  const departureMetar = metarReports.find(
    (report) => report.icaoId === nearest.departure.icao
  );
  const arrivalMetar = metarReports.find(
    (report) => report.icaoId === nearest.arrival.icao
  );
  const departureTaf = tafReports.find(
    (report) => report.icaoId === nearest.departure.icao
  );
  const arrivalTaf = tafReports.find(
    (report) => report.icaoId === nearest.arrival.icao
  );

  const liveMapPoints = liveAircraft.slice(0, 40).map((aircraft) => ({
    id: aircraft.id,
    lat: aircraft.latitude,
    lon: aircraft.longitude,
    name: aircraft.callsign,
    detail: [
      aircraft.country,
      aircraft.barometricAltitude !== null
        ? `${Math.round(aircraft.barometricAltitude)} m`
        : "Altitude inconnue",
      aircraft.velocity !== null
        ? `${Math.round(aircraft.velocity * 3.6)} km/h`
        : "Vitesse inconnue"
    ].join(" • "),
    color: aircraft.id === selectedLiveId ? "#5fd2ff" : "#8b9aab",
    icon: "✈"
  }));

  return (
    <section className="aviation-top-grid">
      <div className="aviation-left-column">
        <article className="panel aviation-map-panel">
          <div className="map-toolbar">
            <span>100 NM</span>
            <span>✈ {liveAircraft.length || "—"}</span>
            <span>🚁 3</span>
            <span>📍 20 km</span>
            <span>{aircraftSourceStatus}</span>
          </div>

          <div className="aviation-map">
            <StableMap
              points={[
                  {
                    id: "home",
                    lat: userPosition[0],
                    lon: userPosition[1],
                    name: "Position",
                    detail: locationStatus,
                    color: "#4da3ff",
                    icon: "📍",
                    category: "home"
                  },
                  ...(liveMapPoints.length > 0
                    ? liveMapPoints
                    : [
                        {
                          id: "demo-plane",
                          lat: userPosition[0] + 0.08,
                          lon: userPosition[1] - 0.04,
                          name: "DÉMO",
                          detail: "OpenSky indisponible",
                          color: "#8b9aab",
                          icon: "✈"
                        }
                      ])
                ]}
                trails={
                  liveTrail.length > 1
                    ? [
                        {
                          id: "live-flight",
                          positions: liveTrail,
                          color: "#5fd2ff",
                          selected: true
                        }
                      ]
                    : []
                }
                selectedId={selectedLiveId}
              center={[46.42, 4.86]}
              zoom={7}
            />
          </div>
        </article>

        <article className="panel radar-panel">
          <div className="panel-title">
            <div>
              <h3>Mini radar local</h3>
              <p className="muted">Situation aérienne dans un rayon de 50 km</p>
            </div>
            <strong className="cyan">5 appareils</strong>
          </div>

          <div className="radar-content">
            <div className="radar">
              <div className="radar-ring r1" />
              <div className="radar-ring r2" />
              <div className="radar-ring r3" />
              <div className="radar-line h" />
              <div className="radar-line v" />
              <span className="radar-home" />
              <span className="radar-dot d1" />
              <span className="radar-dot d2" />
              <span className="radar-dot d3" />
              <span className="radar-dot d4" />
              <span className="radar-dot d5" />
            </div>

            <div className="radar-stats">
              <div><span>≤ 5 km</span><strong>0</strong></div>
              <div><span>≤ 10 km</span><strong>0</strong></div>
              <div><span>≤ 25 km</span><strong>1</strong></div>
              <div><span>≤ 50 km</span><strong>5</strong></div>
              <div className="nearest"><span>Le plus proche</span><strong>19,0 km</strong></div>
            </div>
          </div>
        </article>

        <article className="panel next-flights-panel">
          <div className="panel-title">
            <div>
              <h3>Les 5 prochains avions</h3>
              <p className="muted">Départ, arrivée et distance</p>
            </div>
          </div>

          <div className="rows">
            {flights.map((flight, index) => (
              <div className="flight-row" key={flight.id}>
                <div className="rank">{index + 1}</div>
                <div className="grow">
                  <strong>{flight.route}</strong>
                  <small>{flight.type} • {flight.company}</small>
                </div>
                <strong className="cyan">{flight.distance}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="aviation-right-column">
        <article className="panel moment-panel">
          <div className="moment-title">
            <div>
              <span className="eyebrow">AVION DU MOMENT</span>
              <h2>{nearest.id}</h2>
              <span className="category-pill">Transport commercial</span>
            </div>

            <figure className="plane-photo-card">
              <img
                src="/aircraft/easyjet-a320.jpg"
                alt="Airbus A320 easyJet en vol"
                className="plane-photo"
              />
              <figcaption>Photo illustrative • crédit dans le README</figcaption>
            </figure>
          </div>

          <p className="aircraft-model">{nearest.type}</p>

          <div className="airline-strip">
            <div className="airline-logo">E</div>
            <div>
              <strong>{nearest.company}</strong>
              <span>{nearest.registration}</span>
            </div>
          </div>

          <div className="passage-card">
            <div>
              <span>✈️ Passage au plus près</span>
              <h3>{counterLabel} {counter}</h3>
              <small className="passage-local-time">Heure locale : {localTime}</small>
            </div>

            <div className="passage-distance">
              <span>Distance minimale</span>
              <strong>{nearest.distance}</strong>
              <small>Cap {nearest.bearing}</small>
            </div>
          </div>

          <div className="approach-gauge">
            <span className="gauge-pin">📍</span>
            <div className="gauge-track">
              <span className="gauge-plane" style={{ left: `${progress}%` }}>✈</span>
            </div>
          </div>

          <div className="observation-grid">
            <div><span>👀 Où regarder ?</span><strong>{nearest.direction}</strong></div>
            <div><span>Hauteur estimée</span><strong>{nearest.height}</strong></div>
            <div><span>Distance actuelle</span><strong>{nearest.distance}</strong></div>
          </div>

          <div className="airport-weather-grid">
            <article className="airport-weather-card departure">
              <div className="airport-heading">
                <span>🛫 Départ</span>
                <strong>{nearest.departure.code}</strong>
              </div>
              <h3>{nearest.departure.city}</h3>
              <p>{nearest.departure.airport}</p>
              <div className="airport-weather">
                <span className="airport-weather-icon">{weatherIcon(departureWeather?.code)}</span>
                <div>
                  <strong>{departureWeather ? `${Math.round(departureWeather.temperature)} °C` : "—"}</strong>
                  <small>{weatherLabel(departureWeather?.code)}</small>
                </div>
                <div className="airport-wind">
                  <span>Vent</span>
                  <strong>{departureWeather ? `${Math.round(departureWeather.wind)} km/h` : "—"}</strong>
                </div>
              </div>
              <div className="aviation-report">
                <span>METAR {nearest.departure.icao}</span>
                <strong>{shortReport(departureMetar?.rawOb)}</strong>
                <span>TAF</span>
                <small>{shortReport(departureTaf?.rawTAF)}</small>
              </div>
            </article>

            <article className="airport-weather-card arrival">
              <div className="airport-heading">
                <span>🛬 Arrivée</span>
                <strong>{nearest.arrival.code}</strong>
              </div>
              <h3>{nearest.arrival.city}</h3>
              <p>{nearest.arrival.airport}</p>
              <div className="airport-weather">
                <span className="airport-weather-icon">{weatherIcon(arrivalWeather?.code)}</span>
                <div>
                  <strong>{arrivalWeather ? `${Math.round(arrivalWeather.temperature)} °C` : "—"}</strong>
                  <small>{weatherLabel(arrivalWeather?.code)}</small>
                </div>
                <div className="airport-wind">
                  <span>Vent</span>
                  <strong>{arrivalWeather ? `${Math.round(arrivalWeather.wind)} km/h` : "—"}</strong>
                </div>
              </div>
              <div className="aviation-report">
                <span>METAR {nearest.arrival.icao}</span>
                <strong>{shortReport(arrivalMetar?.rawOb)}</strong>
                <span>TAF</span>
                <small>{shortReport(arrivalTaf?.rawTAF)}</small>
              </div>
            </article>
          </div>

          <div className="aircraft-specs">
            <div><span>Longueur</span><strong>37,57 m</strong></div>
            <div><span>Envergure</span><strong>35,80 m</strong></div>
            <div><span>Altitude max.</span><strong>39 000 ft</strong></div>
            <div><span>Vitesse croisière</span><strong>840 km/h</strong></div>
          </div>
        </article>
      </div>
    </section>
  );
}
