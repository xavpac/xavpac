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
  const [status, setStatus] = useState("Position en attente");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n’est pas prise en charge par ce navigateur.");
      setStatus("GPS indisponible • aucune position affichée");
      return;
    }

    setStatus("Recherche de votre position…");

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setPosition([result.coords.latitude, result.coords.longitude]);
        setAccuracy(result.coords.accuracy);
        setIsLive(true);
        setError("");
        setStatus(`HOME • GPS réel ±${Math.round(result.coords.accuracy)} m`);
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
        setStatus("Aucune position affichée");
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
