"use client";

import { useEffect, useState } from "react";
import { BUILD_INFO } from "../../lib/buildInfo";
import AppIcon from "../ui/AppIcon";
import ViewCounter from "../ViewCounter";

export default function AppHeader({ onOpenTechnical, technicalActive }: { onOpenTechnical: () => void; technicalActive: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"aurora" | "dark">("aurora");

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("xavpac:theme");
    const nextTheme = stored === "dark" ? "dark" : "aurora";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "aurora" ? "dark" : "aurora";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("xavpac:theme", nextTheme);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute("content", nextTheme === "aurora" ? "#dfeff8" : "#07131f");
  }

  return <header className="v2-header">
    <div className="v2-brand">
      <span className="v2-brand-mark"><i /><AppIcon name="aircraft" size={27} /></span>
      <div><h1>XavPac <b>6.5</b></h1><p>Live intelligence · build {BUILD_INFO.number}</p></div>
    </div>

    <div className="v2-header-status">
      <span className="v2-live-status"><i /> En direct</span>
      <ViewCounter />
      <button type="button" className="v2-icon-button v2-theme-toggle" onClick={toggleTheme} aria-label={theme === "aurora" ? "Passer au thème sombre" : "Passer au thème clair"} title={theme === "aurora" ? "Thème sombre" : "Thème clair"}><span aria-hidden="true">{theme === "aurora" ? "🌙" : "☀️"}</span></button>
      <button type="button" className={technicalActive ? "v2-icon-button active" : "v2-icon-button"} onClick={onOpenTechnical} aria-label="Ouvrir les informations techniques" title="Informations techniques"><AppIcon name="info" size={20} /></button>
      <time className="v2-clock" dateTime={now?.toISOString()}><strong>{now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong><span>{now ? now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : ""}</span></time>
    </div>
  </header>;
}
