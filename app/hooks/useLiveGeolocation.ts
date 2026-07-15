"use client";

import { useEffect, useState } from "react";

export const BAGE_DOMMARTIN_POSITION: [number, number] = [46.307, 4.945];

export type LiveGeolocation = {
  position: [number, number];
  status: string;
  accuracy: number | null;
  isLive: boolean;
  error: string;
};

export function useLiveGeolocation(): LiveGeolocation {
  const [position, setPosition] = useState<[number, number]>(BAGE_DOMMARTIN_POSITION);
  const [status, setStatus] = useState("Bâgé-Dommartin • position de secours");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n’est pas prise en charge par ce navigateur.");
      setStatus("Bâgé-Dommartin • GPS indisponible");
      return;
    }

    setStatus("Recherche de votre position…");

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
            ? "Autorisez la localisation pour utiliser les fonctions autour de vous."
            : geolocationError.code === geolocationError.TIMEOUT
              ? "La position GPS met trop de temps à répondre."
              : "La position GPS est momentanément indisponible.";

        setError(message);
        setStatus("Bâgé-Dommartin • position de secours");
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
