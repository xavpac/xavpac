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
  { id: "aviation" as Tab, icon: "✈", title: "Aviation", subtitle: "Trafic réel autour de vous" },
  { id: "drone" as Tab, icon: "🚁", title: "Drone SDIS 71", subtitle: "Saône-et-Loire et RTBA" },
  { id: "operations" as Tab, icon: "🚒", title: "Moyens nationaux", subtitle: "Détection ADS-B sans données fictives" },
  { id: "center" as Tab, icon: "🚨", title: "CODIS", subtitle: "Vue opérationnelle SDIS 71" },
  { id: "astronomy" as Tab, icon: "🌌", title: "Astronomie", subtitle: "ISS, Starlink et ciel local" },
  { id: "weather" as Tab, icon: "🌦️", title: "Météo locale", subtitle: "Conditions selon votre GPS" }
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
    <main className="app-v4">
      <header className="header-v4">
        <div className="brand-v4">
          <span className="brand-plane">✈</span>
          <div>
            <h1>XavPac <b>5.0</b></h1>
            <p>Aviation • Drone SDIS 71 • Moyens nationaux • CODIS • Astronomie • Météo</p>
          </div>
        </div>
        <div className="header-live-area">
          <ViewCounter />
          <span className="system-live">● SYSTÈME ACTIF</span>
          <div className="clock-v4">
            <strong>{now ? now.toLocaleTimeString("fr-FR") : "--:--:--"}</strong>
            <span>{now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : ""}</span>
          </div>
        </div>
      </header>

      <nav className="tabs-v4" aria-label="Modules XavPac">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={active === tab.id ? "tab-v4 active" : "tab-v4"}
            onClick={() => setActive(tab.id)}
          >
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

      <footer className="footer-v4">
        XavPac 5.0 • Géolocalisation continue lorsque le site reste ouvert • Les sources officielles restent prioritaires pour toute décision opérationnelle.
      </footer>
    </main>
  );
}
