"use client";

import { useEffect, useMemo, useState } from "react";
import { BUILD_INFO, DATA_UPDATE_EVENT, type DataModule } from "../lib/buildInfo";

type SourceDiagnostic = {
  id: string;
  name: string;
  state: "available" | "degraded" | "offline" | "disabled";
  lastSuccess: string | null;
  lastFailure: string | null;
  averageResponseMs: number | null;
  requests: number;
  errors: number;
  errorRate: number;
  cacheHits: number;
  quota: string;
  lastError: string | null;
};

const modules: Array<[DataModule, string]> = [
  ["aviation", "Aviation"],
  ["operations", "Moyens nationaux"],
  ["drone", "Drone"],
  ["weather", "Météo"],
  ["astronomy", "Astronomie"]
];
const emptyUpdates = { aviation: null, operations: null, drone: null, weather: null, astronomy: null } as Record<DataModule, string | null>;
const stateLabels = { available: "Disponible", degraded: "Dégradée", offline: "Hors ligne", disabled: "Désactivée" };

function readUpdates() {
  return Object.fromEntries(modules.map(([key]) => [key, localStorage.getItem(`xavpac:update:${key}`)])) as Record<DataModule, string | null>;
}

function displayDate(value: string | null, fallback = "Non actualisée sur cet appareil") {
  return value ? new Date(value).toLocaleString("fr-FR") : fallback;
}

export default function TechnicalInformationPanel() {
  const [updates, setUpdates] = useState(emptyUpdates);
  const [sources, setSources] = useState<SourceDiagnostic[]>([]);
  const [cache, setCache] = useState<{ hits?: number; misses?: number; size?: number }>({});
  const [diagnosticUpdatedAt, setDiagnosticUpdatedAt] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  useEffect(() => {
    const refreshUpdates = () => setUpdates(readUpdates());
    refreshUpdates();
    addEventListener(DATA_UPDATE_EVENT, refreshUpdates);
    return () => removeEventListener(DATA_UPDATE_EVENT, refreshUpdates);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshDiagnostics() {
      try {
        const response = await fetch("/api/source-health", { cache: "no-store" });
        if (!response.ok) throw new Error(`Diagnostic indisponible (${response.status})`);
        const payload = await response.json();
        if (cancelled) return;
        setSources(Array.isArray(payload.sources) ? payload.sources : []);
        setCache(payload.cache ?? {});
        setDiagnosticUpdatedAt(payload.generatedAt ?? null);
        setDiagnosticError(null);
      } catch (error) {
        if (!cancelled) setDiagnosticError(error instanceof Error ? error.message : "Diagnostic indisponible");
      }
    }
    void refreshDiagnostics();
    const timer = window.setInterval(refreshDiagnostics, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const totals = useMemo(() => ({
    available: sources.filter((source) => source.state === "available").length,
    errors: sources.reduce((sum, source) => sum + source.errors, 0),
    requests: sources.reduce((sum, source) => sum + source.requests, 0)
  }), [sources]);
  const official = BUILD_INFO.environment === "Production";

  return (
    <section className="technical-information-page">
      <header className="technical-information-header panel">
        <div><span className="eyebrow">DIAGNOSTIC ET VERSION</span><h1>Informations techniques</h1><p>Version, actualisation locale, cache et état des fournisseurs de données.</p></div>
        <div className={`technical-release-badge ${official ? "official" : "development"}`}>{official ? "PRODUCTION" : "DÉVELOPPEMENT"}</div>
      </header>

      <div className="technical-information-grid">
        <article className="panel technical-card"><span className="eyebrow">APPLICATION</span><h2>XavPac {BUILD_INFO.version}</h2><dl>
          <div><dt>Build</dt><dd>#{BUILD_INFO.number}</dd></div>
          <div><dt>Date</dt><dd>{BUILD_INFO.date} à {BUILD_INFO.time}</dd></div>
          <div><dt>Commit</dt><dd>{BUILD_INFO.commit}</dd></div>
          <div><dt>Environnement</dt><dd>{BUILD_INFO.environment}</dd></div>
        </dl></article>
        <article className="panel technical-card"><span className="eyebrow">ACTUALISATION DES MODULES</span><div className="technical-update-list">{modules.map(([key, label]) => <div key={key}><strong>{label}</strong><span>{displayDate(updates[key])}</span></div>)}</div></article>
      </div>

      <div className="technical-summary panel">
        <div><span>Fournisseurs disponibles</span><strong>{totals.available} / {sources.length}</strong></div>
        <div><span>Requêtes observées</span><strong>{totals.requests}</strong></div>
        <div><span>Erreurs observées</span><strong>{totals.errors}</strong></div>
        <div><span>Entrées en cache</span><strong>{cache.size ?? 0}</strong></div>
        <div><span>Réponses du cache</span><strong>{cache.hits ?? 0}</strong></div>
        <div><span>Appels nécessaires</span><strong>{cache.misses ?? 0}</strong></div>
      </div>

      {diagnosticError && <p className="technical-global-error">{diagnosticError}</p>}
      <div className="technical-source-grid">{sources.length ? sources.map((source) => <article className={`panel technical-source-card ${source.state}`} key={source.id}>
        <header><span className="technical-source-dot" /><div><h2>{source.name}</h2><strong>{stateLabels[source.state]}</strong></div></header>
        <dl>
          <div><dt>Dernier succès</dt><dd>{displayDate(source.lastSuccess, "Aucun")}</dd></div>
          <div><dt>Dernier échec</dt><dd>{displayDate(source.lastFailure, "Aucun")}</dd></div>
          <div><dt>Temps moyen</dt><dd>{source.averageResponseMs === null ? "—" : `${source.averageResponseMs} ms`}</dd></div>
          <div><dt>Requêtes</dt><dd>{source.requests}</dd></div>
          <div><dt>Taux d’erreur</dt><dd>{(source.errorRate * 100).toFixed(1)} %</dd></div>
          <div><dt>Quota connu</dt><dd>{source.quota}</dd></div>
        </dl>
        {source.lastError && <p className="technical-source-error">{source.lastError}</p>}
      </article>) : <article className="panel technical-source-empty"><h2>Mesures en attente</h2><p>Les diagnostics apparaîtront après les premiers appels aux fournisseurs.</p></article>}</div>
      <footer className="technical-diagnostic-time">Diagnostic actualisé : {displayDate(diagnosticUpdatedAt, "en attente")}</footer>
    </section>
  );
}
