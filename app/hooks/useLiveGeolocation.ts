"use client";

import { useEffect, useState } from "react";

export type LiveGeolocation = {
  position: [number, number] | null;
  status: string;
  accuracy: number | null;
  isLive: boolean;
  error: string;
};

export function useLiveGeolocation(): LiveGeolocation {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState("Autorisez la localisation pour afficher HOME");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
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
        setIsLive(true);
        setError("");
        setStatus(`HOME • GPS réel ±${Math.round(result.coords.accuracy)} m`);
      },
      (geolocationError) => {
        setPosition(null);
        setIsLive(false);
        setAccuracy(null);
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
  }, []);

  return { position, status, accuracy, isLive, error };
}
