"use client";

import { useEffect, useState } from "react";

type Health = {
  id: string; name: string; state: "available" | "degraded" | "offline" | "disabled";
  lastSuccess: string | null; lastFailure: string | null; averageResponseMs: number | null;
  requests: number; errors: number; errorRate: number; cacheHits: number; quota: string; lastError: string | null;
};

const labels = { available: "Disponible", degraded: "Dégradée", offline: "Hors ligne", disabled: "Désactivée" };

export default function SourceHealthPanel() {
  const [sources, setSources] = useState<Health[]>([]);
  const [cache, setCache] = useState<{ hits?: number; misses?: number; size?: number }>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/source-health", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) { setSources(Array.isArray(payload.sources) ? payload.sources : []); setCache(payload.cache ?? {}); setUpdatedAt(payload.generatedAt ?? null); }
      } catch { if (!cancelled) setSources([]); }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return <section className="source-health-page">
    <header className="hero source-health-hero"><div><span className="eyebrow">TRANSPARENCE DES DONNÉES</span><h1>Santé des sources</h1><p>État observé par cette instance serveur. Une source désactivée n’est jamais interrogée.</p></div><div className="hero-status neutral"><span>♥</span><div><strong>{sources.filter((s) => s.state === "available").length} disponible(s)</strong><small>MAJ {updatedAt ? new Date(updatedAt).toLocaleTimeString("fr-FR") : "—"}</small></div></div></header>
    <div className="source-health-summary panel"><div><span>Cache mémoire</span><strong>{cache.size ?? 0} entrées</strong></div><div><span>Réponses du cache</span><strong>{cache.hits ?? 0}</strong></div><div><span>Appels nécessaires</span><strong>{cache.misses ?? 0}</strong></div></div>
    <div className="source-health-grid">{sources.length ? sources.map((source) => <article className={`panel source-health-card ${source.state}`} key={source.id}>
      <header><span className="source-health-dot"/><div><h2>{source.name}</h2><strong>{labels[source.state]}</strong></div></header>
      <dl><div><dt>Dernier succès</dt><dd>{source.lastSuccess ? new Date(source.lastSuccess).toLocaleString("fr-FR") : "Aucun"}</dd></div><div><dt>Dernier échec</dt><dd>{source.lastFailure ? new Date(source.lastFailure).toLocaleString("fr-FR") : "Aucun"}</dd></div><div><dt>Temps moyen</dt><dd>{source.averageResponseMs === null ? "—" : `${source.averageResponseMs} ms`}</dd></div><div><dt>Requêtes</dt><dd>{source.requests}</dd></div><div><dt>Taux d’erreur</dt><dd>{(source.errorRate * 100).toFixed(1)} %</dd></div><div><dt>Quota connu</dt><dd>{source.quota}</dd></div></dl>
      {source.lastError && <p className="source-health-error">{source.lastError}</p>}
    </article>) : <article className="panel source-health-empty"><h2>Mesures en attente</h2><p>Ouvrez l’onglet Aviation pour solliciter les adaptateurs, puis revenez ici.</p></article>}</div>
  </section>;
}
