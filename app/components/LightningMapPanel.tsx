"use client";

import { LIGHTNING_PUBLIC_MAP_URL, lightningMapUrl } from "../lib/weather/lightning";

export default function LightningMapPanel({ position, compact = false }: { position?: [number, number] | null; compact?: boolean }) {
  return <article className={`panel lightning-live-panel ${compact ? "compact" : ""}`}>
    <header>
      <div>
        <span className="eyebrow">⚡ IMPACTS DE FOUDRE EN DIRECT</span>
        <h3>{position ? "Autour du point sélectionné" : "Vue générale de la France"}</h3>
        <p>Les impacts les plus récents sont clairs ; ils foncent en vieillissant sur la fenêtre affichée.</p>
      </div>
      <a href={LIGHTNING_PUBLIC_MAP_URL} target="_blank" rel="noreferrer">Plein écran ↗</a>
    </header>
    <div className="lightning-live-frame">
      <iframe
        key={lightningMapUrl(position)}
        src={lightningMapUrl(position)}
        title="Carte en direct des impacts de foudre Blitzortung"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
    <footer>
      <span><b>Source :</b> Blitzortung.org • réseau public indicatif</span>
      <strong>Ne pas utiliser seul pour la protection des personnes, du matériel ou pour décider d’un vol.</strong>
    </footer>
  </article>;
}
