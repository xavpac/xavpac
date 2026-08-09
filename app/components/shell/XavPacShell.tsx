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
import { NAVIGATION, moduleBelongsToUniverse, type ModuleId, type Universe } from "../../config/navigation";
import AppHeader from "./AppHeader";
import ModuleNavigation from "./ModuleNavigation";
import UniverseSwitcher from "./UniverseSwitcher";
import ModuleErrorBoundary from "../ModuleErrorBoundary";
import { initializeBrowserStorage } from "../../lib/safeStorage";

function ActivePanel({ module }: { module: ModuleId }) {
  if (module === "aviation") return <AviationPanel />;
  if (module === "operations") return <OperationsPanel />;
  if (module === "spotting") return <SpottingLogPanel />;
  if (module === "drone") return <DronePanel />;
  if (module === "center") return <CenterOperationsPanel />;
  if (module === "astronomy") return <AstronomyPanel />;
  if (module === "weather") return <WeatherPanel />;
  return <TechnicalInformationPanel />;
}

export default function XavPacShell({ universe }: { universe: Universe }) {
  const navigation = NAVIGATION[universe];
  const [activeModule, setActiveModule] = useState<ModuleId>(navigation.defaultModule);

  useEffect(() => {
    initializeBrowserStorage();
  }, []);

  function selectModule(module: ModuleId) {
    if (module === "technical" || moduleBelongsToUniverse(universe, module)) setActiveModule(module);
  }

  return <main className={`v2-shell v2-${universe}`}>
    <AppHeader technicalActive={activeModule === "technical"} onOpenTechnical={() => selectModule("technical")} />
    <UniverseSwitcher activeUniverse={universe} />
    <ModuleNavigation modules={navigation.modules} activeModule={activeModule} onChange={selectModule} />

    <section className="v2-workspace" aria-live="polite">
      <ModuleErrorBoundary key={activeModule} module={activeModule}>
        <ActivePanel module={activeModule} />
      </ModuleErrorBoundary>
    </section>

    <ModuleNavigation modules={navigation.modules} activeModule={activeModule} onChange={selectModule} mobile />
  </main>;
}
