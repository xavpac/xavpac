"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type LiveGeolocation = {
  position: [number, number] | null;
  status: string;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number | null;
  isLive: boolean;
  trackingEnabled: boolean;
  setTrackingEnabled: (enabled: boolean) => void;
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
  const [error, setError] = useState("");

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
        setPosition([result.coords.latitude, result.coords.longitude]);
        setAccuracy(result.coords.accuracy);
        setAltitude(result.coords.altitude);
        setTimestamp(result.timestamp);
        setIsLive(true);
        setError("");
        setStatus(`HOME • GPS réel ±${Math.round(result.coords.accuracy)} m`);
      },
      (geolocationError) => {
        setPosition(null);
        setIsLive(false);
        setAccuracy(null);
        setAltitude(null);
        setTimestamp(null);
        setError("Position GPS indisponible");
        setStatus("Position GPS indisponible");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 15000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingEnabled]);

  return { position, status, accuracy, altitude, timestamp, isLive, trackingEnabled, setTrackingEnabled, error };
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
