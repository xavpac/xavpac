import type { ModuleId, NavigationModule } from "../../config/navigation";
import AppIcon from "../ui/AppIcon";

export default function ModuleNavigation({ modules, activeModule, onChange, mobile = false }: { modules: readonly NavigationModule[]; activeModule: ModuleId; onChange: (module: ModuleId) => void; mobile?: boolean }) {
  return <nav className={mobile ? "v2-mobile-nav" : "v2-module-nav"} aria-label="Sections">
    {modules.map((module) => <button type="button" key={module.id} className={activeModule === module.id ? "active" : ""} onClick={() => onChange(module.id)} aria-pressed={activeModule === module.id}>
      <AppIcon name={module.icon} size={mobile ? 20 : 22} />
      <span><strong>{mobile ? module.shortTitle : module.title}</strong>{!mobile && <small>{module.subtitle}</small>}</span>
    </button>)}
  </nav>;
}
