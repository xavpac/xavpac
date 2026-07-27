import Link from "next/link";
import { NAVIGATION, type Universe } from "../../config/navigation";
import AppIcon from "../ui/AppIcon";

export default function UniverseSwitcher({ activeUniverse }: { activeUniverse: Universe }) {
  return <nav className="v2-universe-switcher" aria-label="Univers XavPac">
    {(Object.keys(NAVIGATION) as Universe[]).map((universe) => {
      const item = NAVIGATION[universe];
      const active = universe === activeUniverse;
      return <Link key={universe} href={item.href} className={active ? `v2-universe ${universe} active` : `v2-universe ${universe}`} aria-current={active ? "page" : undefined}>
        <span className="v2-universe-icon"><AppIcon name={universe === "spotter" ? "aircraft" : "drone"} size={25} /></span>
        <span><strong>{item.title}</strong><small>{item.description}</small></span>
        <i>{active ? "Ouvert" : "Accéder"}</i>
      </Link>;
    })}
  </nav>;
}
