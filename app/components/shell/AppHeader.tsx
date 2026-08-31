"use client";

import { useEffect, useState } from "react";
import { BUILD_INFO } from "../../lib/buildInfo";
import AppIcon from "../ui/AppIcon";
import ViewCounter from "../ViewCounter";

export default function AppHeader({ onOpenTechnical, technicalActive }: { onOpenTechnical: () => void; technicalActive: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <header className="v2-header">
    <div className="v2-brand">
      <span className="v2-brand-mark"><AppIcon name="aircraft" size={28} /></span>
      <div><h1>XavPac <b>6.5</b></h1><p>Build {BUILD_INFO.number} · {BUILD_INFO.environment}</p></div>
    </div>

    <div className="v2-header-status">
      <span className="v2-live-status"><i /> Données en direct</span>
      <ViewCounter />
      <button type="button" className={technicalActive ? "v2-icon-button active" : "v2-icon-button"} onClick={onOpenTechnical} aria-label="Ouvrir les informations techniques" title="Informations techniques"><AppIcon name="info" size={20} /></button>
      <time className="v2-clock" dateTime={now?.toISOString()}><strong>{now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong><span>{now ? now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : ""}</span></time>
    </div>
  </header>;
}
