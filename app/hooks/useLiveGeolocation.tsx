"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { assessGpsQuality, formatPositionAge, gpsQualityLabel, type GpsQuality } from "../lib/geolocationQuality";

const MAX_USABLE_ACCURACY_METERS = 100;

export type LiveGeolocation = {
  position: [number, number] | null;
  status: string;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number | null;
  ageSeconds: number | null;
  source: "gps" | "unavailable";
  quality: GpsQuality;
  qualityReason: string;
  usableForPreciseCalculations: boolean;
  isLive: boolean;
  trackingEnabled: boolean;
  setTrackingEnabled: (enabled: boolean) => void;
  retryGeolocation: () => void;
  error: string;
};

const LiveGeolocationContext = createContext<LiveGeolocation | null>(null);

function useLiveGeolocationSource(): LiveGeolocation {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState("Autorisez la localisation pour afficher MOI");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [isLive, setIsLive] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [error, setError] = useState("");
  const hasUsablePosition = useRef(false);
  const ageSeconds = timestamp === null ? null : Math.max(0, (clock - timestamp) / 1000);
  const qualityAssessment = assessGpsQuality(accuracy, ageSeconds);

  useEffect(() => {
    if (timestamp === null) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [timestamp]);

  useEffect(() => {
    if (!trackingEnabled) {
      setIsLive(false);
      setStatus("Suivi GPS désactivé");
      return;
    }
    if (!navigator.geolocation) {
      setError("Position GPS indisponible");
      setStatus("Position GPS indisponible");
      return;
    }

    setStatus("Autorisation GPS demandée au navigateur…");

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        const roundedAccuracy = Math.round(result.coords.accuracy);
        if (result.coords.accuracy > MAX_USABLE_ACCURACY_METERS) {
          if (!hasUsablePosition.current) setPosition(null);
          setAccuracy(result.coords.accuracy);
          setAltitude(result.coords.altitude);
          setHeading(typeof result.coords.heading === "number" && Number.isFinite(result.coords.heading) ? result.coords.heading : null);
          setSpeed(typeof result.coords.speed === "number" && Number.isFinite(result.coords.speed) ? result.coords.speed : null);
          setTimestamp(result.timestamp);
          setClock(Date.now());
          setIsLive(false);
          setError(`Position GPS trop imprécise (±${roundedAccuracy.toLocaleString("fr-FR")} m). Corrigez-la par commune ou coordonnées.`);
          setStatus(`GPS trop imprécis • ±${roundedAccuracy.toLocaleString("fr-FR")} m`);
          return;
        }
        hasUsablePosition.current = true;
        setPosition([result.coords.latitude, result.coords.longitude]);
        setAccuracy(result.coords.accuracy);
        setAltitude(result.coords.altitude);
        setHeading(typeof result.coords.heading === "number" && Number.isFinite(result.coords.heading) ? result.coords.heading : null);
        setSpeed(typeof result.coords.speed === "number" && Number.isFinite(result.coords.speed) ? result.coords.speed : null);
        setTimestamp(result.timestamp);
        setClock(Date.now());
        setIsLive(true);
        setError("");
        setStatus(`MOI • GPS réel ±${Math.round(result.coords.accuracy)} m`);
      },
      (geolocationError) => {
        if (!hasUsablePosition.current || geolocationError.code === geolocationError.PERMISSION_DENIED) setPosition(null);
        setIsLive(false);
        if (!hasUsablePosition.current) {
          setAccuracy(null);
          setAltitude(null);
          setHeading(null);
          setSpeed(null);
          setTimestamp(null);
        }
        const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
        const message = geolocationError.code === geolocationError.PERMISSION_DENIED
          ? isMac
            ? "Localisation refusée sur le Mac. Ouvrez Réglages Système › Confidentialité et sécurité › Service de localisation, autorisez votre navigateur (ou Codex), puis relancez la position."
            : "Localisation refusée. Autorisez la position dans les réglages du navigateur, puis relancez le GPS."
          : geolocationError.code === geolocationError.TIMEOUT
            ? "Le GPS n’a pas répondu à temps. Relancez-le ou indiquez votre commune."
            : "Le navigateur ne parvient pas à déterminer votre position. Indiquez votre commune ou vos coordonnées.";
        setError(message);
        setStatus(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingEnabled, requestVersion]);

  function retryGeolocation() {
    setError("");
    setStatus("Nouvelle demande de localisation…");
    setTrackingEnabled(true);
    setRequestVersion((value) => value + 1);
  }

  const liveStatus = position && accuracy !== null
    ? `MOI • GPS ${gpsQualityLabel(qualityAssessment.quality)} ±${Math.round(accuracy)} m • ${formatPositionAge(ageSeconds)}`
    : status;

  return {
    position,
    status: liveStatus,
    accuracy,
    altitude,
    heading,
    speed,
    timestamp,
    ageSeconds,
    source: position ? "gps" : "unavailable",
    quality: qualityAssessment.quality,
    qualityReason: qualityAssessment.reason,
    usableForPreciseCalculations: qualityAssessment.usableForPreciseCalculations,
    isLive,
    trackingEnabled,
    setTrackingEnabled,
    retryGeolocation,
    error
  };
}

export function LiveGeolocationProvider({ children }: { children: React.ReactNode }) {
  const geolocation = useLiveGeolocationSource();
  return <LiveGeolocationContext.Provider value={geolocation}>{children}</LiveGeolocationContext.Provider>;
}

export function useLiveGeolocation(): LiveGeolocation {
  const geolocation = useContext(LiveGeolocationContext);
  if (!geolocation) throw new Error("useLiveGeolocation doit être utilisé dans LiveGeolocationProvider");
  return geolocation;
}
