"use client";

import { useEffect, useRef } from "react";
import XavPacShell from "../components/shell/XavPacShell";

export default function SpotterPage() {
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const directAircraftView =
      params.get("mode") === "avion";

    if (
      !directAircraftView ||
      autoOpenedRef.current
    ) {
      return;
    }

    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts += 1;

      if (autoOpenedRef.current) {
        window.clearInterval(timer);
        return;
      }

      const buttons =
        Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            ".spotter-touch-dock button"
          )
        );

      const aircraftViewButton =
        buttons.find((button) => {
          const label =
            button
              .querySelector("strong")
              ?.textContent
              ?.trim();

          return label === "Vue avion";
        });

      if (aircraftViewButton) {
        autoOpenedRef.current = true;

        aircraftViewButton.click();

        window.clearInterval(timer);
        return;
      }

      if (attempts >= 100) {
        window.clearInterval(timer);
      }
    }, 150);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <XavPacShell universe="spotter" />
  );
}
