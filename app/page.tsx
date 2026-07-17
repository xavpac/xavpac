"use client";

import { useEffect, useState } from "react";
import AviationPanel from "./components/AviationPanel";
import OperationsPanel from "./components/OperationsPanel";
import DronePanel from "./components/DronePanel";
import AstronomyPanel from "./components/AstronomyPanel";
import WeatherPanel from "./components/WeatherPanel";
import CenterOperationsPanel from "./components/CenterOperationsPanel";
import ViewCounter from "./components/ViewCounter";

type Tab = "aviation" | "drone" | "operations" | "center" | "astronomy" | "weather";

const tabs = [
  { id: "aviation" as Tab, icon: "✈", title: "Aviation", subtitle: "Avions en vol" },
  { id: "drone" as Tab, icon: "⌁", title: "Drone", subtitle: "Zones & RTBA" },
  { id: "operations" as Tab, icon: "🚁", title: "Moyens nationaux", subtitle: "Canadair, Dash, etc." },
  { id: "center" as Tab, icon: "☀", title: "CODIS", subtitle: "Centre opérationnel" },
  { id: "weather" as Tab, icon: "🌤️", title: "Météo", subtitle: "Prévisions" },
  { id: "astronomy" as Tab, icon: "◔", title: "Astronomie", subtitle: "Ciel & étoiles" }
];

export default function Page() {
  const [active, setActive] = useState<Tab>("aviation");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="app-v4 app-v61">
      <header className="header-v4 header-v61">
        <div className="brand-v4">
          <span className="brand-plane">✈</span>
          <div>
            <h1>XavPac <b>6.2</b></h1>
            <p>Aviation en temps réel</p>
          </div>
        </div>
        <div className="header-live-area">
          <ViewCounter />
          <span className="system-live">● SYSTÈME ACTIF<br /><small>Données en direct</small></span>
          <div className="clock-v4">
            <strong>{now ? now.toLocaleTimeString("fr-FR") : "--:--:--"}</strong>
            <span>{now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : ""}</span>
          </div>
        </div>
      </header>

      <nav className="tabs-v4 tabs-v61" aria-label="Modules XavPac">
        {tabs.map((tab) => (
          <button type="button" key={tab.id} className={active === tab.id ? "tab-v4 active" : "tab-v4"} onClick={() => setActive(tab.id)}>
            <span>{tab.icon}</span>
            <div><strong>{tab.title}</strong><small>{tab.subtitle}</small></div>
          </button>
        ))}
      </nav>

      {active === "aviation" && <AviationPanel />}
      {active === "drone" && <DronePanel />}
      {active === "operations" && <OperationsPanel />}
      {active === "center" && <CenterOperationsPanel />}
      {active === "astronomy" && <AstronomyPanel />}
      {active === "weather" && <WeatherPanel />}

      <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
        {tabs.slice(0, 5).map((tab) => (
          <button type="button" key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)}>
            <span>{tab.icon}</span><small>{tab.title === "Moyens nationaux" ? "Moyens" : tab.title}</small>
          </button>
        ))}
      </nav>

      <footer className="footer-v4">XavPac 6.2 • Données aériennes réelles • Photos selon disponibilité • Météo du départ et de l’arrivée • HOME uniquement sur position GPS réelle.</footer>
    </main>
  );
}
