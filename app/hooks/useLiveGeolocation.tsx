"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const MAX_USABLE_ACCURACY_METERS = 2000;

export type LiveGeolocation = {
  position: [number, number] | null;
  status: string;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number | null;
  isLive: boolean;
  trackingEnabled: boolean;
  setTrackingEnabled: (enabled: boolean) => void;
  retryGeolocation: () => void;
  error: string;
};

const LiveGeolocationContext = createContext<LiveGeolocation | null>(null);

function useLiveGeolocationSource(): LiveGeolocation {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState("Autorisez la localisation pour afficher HOME");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [error, setError] = useState("");
  const hasUsablePosition = useRef(false);

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
          setTimestamp(result.timestamp);
          setIsLive(false);
          setError(`Position GPS trop imprécise (±${roundedAccuracy.toLocaleString("fr-FR")} m). Corrigez-la par commune ou coordonnées.`);
          setStatus(`GPS trop imprécis • ±${roundedAccuracy.toLocaleString("fr-FR")} m`);
          return;
        }
        hasUsablePosition.current = true;
        setPosition([result.coords.latitude, result.coords.longitude]);
        setAccuracy(result.coords.accuracy);
        setAltitude(result.coords.altitude);
        setTimestamp(result.timestamp);
        setIsLive(true);
        setError("");
        setStatus(`HOME • GPS réel ±${Math.round(result.coords.accuracy)} m`);
      },
      (geolocationError) => {
        if (!hasUsablePosition.current || geolocationError.code === geolocationError.PERMISSION_DENIED) setPosition(null);
        setIsLive(false);
        if (!hasUsablePosition.current) {
          setAccuracy(null);
          setAltitude(null);
          setTimestamp(null);
        }
        const message = geolocationError.code === geolocationError.PERMISSION_DENIED
          ? "Localisation refusée. Autorisez la position dans les réglages du navigateur, puis relancez le GPS."
          : geolocationError.code === geolocationError.TIMEOUT
            ? "Le GPS n’a pas répondu à temps. Relancez-le ou indiquez votre commune."
            : "Le navigateur ne parvient pas à déterminer votre position. Indiquez votre commune ou vos coordonnées.";
        setError(message);
        setStatus(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 15000
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

  return { position, status, accuracy, altitude, timestamp, isLive, trackingEnabled, setTrackingEnabled, retryGeolocation, error };
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
