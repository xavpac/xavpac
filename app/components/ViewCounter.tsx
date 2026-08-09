"use client";

import { useEffect, useState } from "react";
import { getBrowserStorage, safeGetItem, safeSetItem } from "../lib/safeStorage";

const STORAGE_KEY = "xavpac-local-view-count-v1";
const SESSION_KEY = "xavpac-view-counted-this-session";

export default function ViewCounter() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const local = getBrowserStorage("local");
    const session = getBrowserStorage("session");
    const previous = Number.parseInt(safeGetItem(local, STORAGE_KEY) ?? "0", 10);
    if (safeGetItem(session, SESSION_KEY) === "1") {
      setViews(Number.isFinite(previous) ? previous : 0);
      return;
    }
    const next = Number.isFinite(previous) ? previous + 1 : 1;
    safeSetItem(local, STORAGE_KEY, String(next));
    safeSetItem(session, SESSION_KEY, "1");
    setViews(next);
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
