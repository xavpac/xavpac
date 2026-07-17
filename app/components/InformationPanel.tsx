"use client";
import { useEffect, useState } from "react";
import { BUILD_INFO, DATA_UPDATE_EVENT, type DataModule } from "../lib/buildInfo";

const modules: Array<[DataModule, string]> = [["aviation", "Aviation"], ["operations", "Moyens nationaux"], ["drone", "Drone"], ["weather", "Météo"], ["astronomy", "Astronomie"]];
const empty = { aviation: null, operations: null, drone: null, weather: null, astronomy: null } as Record<DataModule, string | null>;
function readUpdates() { return Object.fromEntries(modules.map(([key]) => [key, localStorage.getItem(`xavpac:update:${key}`)])) as Record<DataModule, string | null>; }
function display(value: string | null) { return value ? new Date(value).toLocaleString("fr-FR") : "Non actualisée sur cet appareil"; }

export default function InformationPanel() {
  const [updates, setUpdates] = useState(empty);
  useEffect(() => { const refresh = () => setUpdates(readUpdates()); refresh(); addEventListener(DATA_UPDATE_EVENT, refresh); return () => removeEventListener(DATA_UPDATE_EVENT, refresh); }, []);
  const official = BUILD_INFO.environment === "Production";
  return <section className="information-page">
    <div className={`release-banner ${official ? "official" : "development"}`}>{official ? "VERSION OFFICIELLE" : "VERSION DE DÉVELOPPEMENT"}</div>
    <div className="information-grid">
      <article className="panel information-card"><span className="eyebrow">VERSION XAVPAC</span><h2>XavPac {BUILD_INFO.version}</h2><dl>
        <div><dt>Date du build</dt><dd>{BUILD_INFO.date}</dd></div><div><dt>Heure du build</dt><dd>{BUILD_INFO.time}</dd></div><div><dt>Numéro du build</dt><dd>#{BUILD_INFO.number}</dd></div><div><dt>Dernier commit</dt><dd>{BUILD_INFO.commit}</dd></div><div><dt>Environnement</dt><dd>{BUILD_INFO.environment}</dd></div>
      </dl></article>
      <article className="panel information-card"><span className="eyebrow">DERNIÈRE MISE À JOUR DES DONNÉES</span><div className="data-update-list">{modules.map(([key,label]) => <div key={key}><strong>{label}</strong><span>{display(updates[key])}</span></div>)}</div></article>
    </div>
    <article className="panel changelog-card"><span className="eyebrow">HISTORIQUE DES VERSIONS</span><h2>Changelog</h2><section><h3>Version 6.4.0 — fiabilisation</h3><ul><li>Agrégateur Aviation gratuit et cohérent</li><li>Trajets qualifiés par source et confiance</li><li>Logos locaux, cache et déduplication</li><li>Conversions et marqueurs sécurisés</li></ul></section><section><h3>Version 6.3.1 — candidate</h3><ul><li>Logos, photos et météo aéroport enrichis</li><li>Assistant Drone utilisable partout en France</li><li>Passages ISS et Starlink sur sept jours</li><li>Fallbacks d’images et sources explicites</li></ul></section><section><h3>Version 6.3.0 — candidate</h3><ul><li>GPS réel et fonctionnement sans GPS</li><li>Trajets, photos et météo de vol</li><li>Refonte Moyens nationaux et Drone</li><li>Version et numéro de build visibles</li></ul></section><section><h3>Version 6.2 — stable</h3><p>Dernière version stable déclarée.</p></section></article>
  </section>;
}
