"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "xavpac-local-view-count-v1";
const SESSION_KEY = "xavpac-view-counted-this-session";

export default function ViewCounter() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    try {
      const previous = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "0", 10);
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") {
        setViews(Number.isFinite(previous) ? previous : 0);
        return;
      }
      const next = Number.isFinite(previous) ? previous + 1 : 1;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      window.sessionStorage.setItem(SESSION_KEY, "1");
      setViews(next);
    } catch {
      setViews(1);
    }
  }, []);

  return (
    <span
      className="view-counter-v5"
      title="Compteur d’ouvertures enregistré sur cet appareil"
      aria-label={`${views ?? 0} ouvertures sur cet appareil`}
    >
      👁 {views ?? "—"} vues
    </span>
  );
}
