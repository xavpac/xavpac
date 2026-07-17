"use client";

import { useEffect, useState } from "react";

// Centre neutre uniquement utilisé pour afficher la carte avant l’accord GPS.
// Il n’est jamais présenté comme étant la position de l’utilisateur.
export const DEFAULT_MAP_CENTER: [number, number] = [46.6, 4.8];

export type LiveGeolocation = {
  position: [number, number];
  status: string;
  accuracy: number | null;
  isLive: boolean;
  error: string;
};

export function useLiveGeolocation(): LiveGeolocation {
  const [position, setPosition] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [status, setStatus] = useState("Recherche de votre position GPS…");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n’est pas prise en charge par ce navigateur.");
      setStatus("Position GPS indisponible");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setPosition([result.coords.latitude, result.coords.longitude]);
        setAccuracy(result.coords.accuracy);
        setIsLive(true);
        setError("");
        setStatus(`GPS en continu • précision ±${Math.round(result.coords.accuracy)} m`);
      },
      (geolocationError) => {
        setIsLive(false);
        setAccuracy(null);

        const message =
          geolocationError.code === geolocationError.PERMISSION_DENIED
            ? "Autorisez la localisation dans le navigateur pour afficher les données autour de vous."
            : geolocationError.code === geolocationError.TIMEOUT
              ? "La position GPS met trop de temps à répondre."
              : "La position GPS est momentanément indisponible.";

        setError(message);
        setStatus("Position GPS indisponible");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { position, status, accuracy, isLive, error };
}
