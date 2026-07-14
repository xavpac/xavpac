"use client";

import { useState } from "react";
import AviationPanel from "./components/AviationPanel";
import OperationsPanel from "./components/OperationsPanel";
import DronePanel from "./components/DronePanel";
import AstronomyPanel from "./components/AstronomyPanel";
import WeatherPanel from "./components/WeatherPanel";

type Tab = "aviation" | "astronomy" | "operations" | "drone" | "weather";

const tabs = [
  { id: "aviation" as Tab, icon: "✈️", title: "Aviation", subtitle: "Avions et passages maison" },
  { id: "drone" as Tab, icon: "⌁", title: "Drone SDIS 71", subtitle: "Décision avant décollage" },
  { id: "operations" as Tab, icon: "🚁", title: "Moyens nationaux", subtitle: "Suivi des moyens aériens de l’État" },
  { id: "astronomy" as Tab, icon: "🌌", title: "Astronomie", subtitle: "Briefing complet de la nuit" },
  { id: "weather" as Tab, icon: "🌦️", title: "Météo Dommartin", subtitle: "Conditions et prévisions locales" }
];

export default function Page() {
  const [active, setActive] = useState<Tab>("aviation");

  return (
    <main className="app">
      <header className="header">
        <div>
          <div className="brand">✈️ <strong>XavPac</strong></div>
          <p>Aviation • Drone SDIS 71 • Moyens nationaux • Astronomie • Météo</p>
        </div>
        <div className="system-status"><span /> Système actif</div>
      </header>

      <nav className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={active === tab.id ? "tab active" : "tab"}
            onClick={() => setActive(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>
              <strong>{tab.title}</strong>
              <small>{tab.subtitle}</small>
            </span>
          </button>
        ))}
      </nav>

      {active === "aviation" && <AviationPanel />}
      {active === "operations" && <OperationsPanel />}
      {active === "drone" && <DronePanel />}
      {active === "astronomy" && <AstronomyPanel />}
      {active === "weather" && <WeatherPanel />}
    </main>
  );
}
