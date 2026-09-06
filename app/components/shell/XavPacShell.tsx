"use client";

import { useEffect, useState } from "react";
import AviationPanel from "../AviationPanel";
import OperationsPanel from "../OperationsPanel";
import DronePanel from "../DronePanel";
import AstronomyPanel from "../AstronomyPanel";
import WeatherPanel from "../WeatherPanel";
import CenterOperationsPanel from "../CenterOperationsPanel";
import TechnicalInformationPanel from "../TechnicalInformationPanel";
import SpottingLogPanel from "../SpottingLogPanel";
import LightningPanel from "../LightningPanel";
import FireRiskPanel from "../FireRiskPanel";
import { NAVIGATION, moduleBelongsToUniverse, type ModuleId, type Universe } from "../../config/navigation";
import AppHeader from "./AppHeader";
import ModuleNavigation from "./ModuleNavigation";
import UniverseSwitcher from "./UniverseSwitcher";
import ModuleErrorBoundary from "../ModuleErrorBoundary";
import { initializeBrowserStorage } from "../../lib/safeStorage";
import AppIcon from "../ui/AppIcon";

function ActivePanel({ module }: { module: ModuleId }) {
  if (module === "aviation") return <AviationPanel />;
  if (module === "operations") return <OperationsPanel />;
  if (module === "spotting") return <SpottingLogPanel />;
  if (module === "drone") return <DronePanel />;
  if (module === "risks") return <FireRiskPanel />;
  if (module === "center") return <CenterOperationsPanel />;
  if (module === "astronomy") return <AstronomyPanel />;
  if (module === "weather") return <WeatherPanel />;
  if (module === "lightning") return <LightningPanel />;
  return <TechnicalInformationPanel />;
}

export default function XavPacShell({ universe }: { universe: Universe }) {
  const navigation = NAVIGATION[universe];
  const [activeModule, setActiveModule] = useState<ModuleId>(navigation.defaultModule);
  const activeNavigation = activeModule === "technical"
    ? { title: "Informations techniques", shortTitle: "Technique", icon: "info" as const }
    : navigation.modules.find((module) => module.id === activeModule) ?? navigation.modules[0];

  useEffect(() => {
    initializeBrowserStorage();
  }, []);

  function selectModule(module: ModuleId) {
    if (module !== "technical" && !moduleBelongsToUniverse(universe, module)) return;
    setActiveModule(module);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  return <main className={`v2-shell v2-${universe}`}>
    <AppHeader technicalActive={activeModule === "technical"} onOpenTechnical={() => selectModule("technical")} />
    <div className="v2-control-deck">
      <UniverseSwitcher activeUniverse={universe} />
      <ModuleNavigation modules={navigation.modules} activeModule={activeModule} onChange={selectModule} />
    </div>

    <div className="v2-workspace-context" aria-label={`Section active : ${activeNavigation.title}`}>
      <span className="v2-context-icon"><AppIcon name={activeNavigation.icon} size={17} /></span>
      <span className="v2-context-path"><b>{navigation.title}</b><i>/</i>{activeNavigation.title}</span>
      <span className="v2-context-live"><i /> Veille active</span>
    </div>

    <section className="v2-workspace" aria-live="polite">
      <ModuleErrorBoundary key={activeModule} module={activeModule}>
        <ActivePanel module={activeModule} />
      </ModuleErrorBoundary>
    </section>

    <ModuleNavigation modules={navigation.modules} activeModule={activeModule} onChange={selectModule} mobile />
  </main>;
}
