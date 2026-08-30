"use client";

import { useEffect, type RefObject } from "react";

type Props = {
  open: boolean;
  rootRef: RefObject<HTMLDivElement>;
  observerLabel: string;
  observerPosition: [number, number] | null;
  radiusKm: number;
  sourceStatus: string;
  soundsEnabled: boolean;
  onClose: () => void;
  onToggleSounds: () => void;
};

export default function AircraftStandbyView({ open, rootRef, observerLabel, observerPosition, radiusKm, sourceStatus, soundsEnabled, onClose, onToggleSounds }: Props) {
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          sentinel = null;
          return;
        }
        sentinel.addEventListener("release", () => {
          sentinel = null;
        }, { once: true });
      } catch { /* Le maintien d'écran est un confort silencieux et optionnel. */ }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinel) void requestWakeLock();
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void sentinel?.release();
      sentinel = null;
    };
  }, [open]);

  return <div ref={rootRef} className={`aircraft-view aircraft-view-standby${open ? " open" : ""}`} aria-hidden={!open} aria-label="Mode avion en veille automatique">
    <div className="aircraft-standby-stage">
      <div className="aircraft-standby-grid" />
      <header className="aircraft-standby-header">
        <div className="aircraft-standby-title">
          <button type="button" onClick={onClose} aria-label="Fermer le Mode avion">←</button>
          <div><span>MODE AVION</span><h2>Veille du ciel</h2><p>La vue reste prête, même sans appareil détecté.</p></div>
        </div>
        <div className="aircraft-standby-actions">
          <span className="aircraft-standby-live"><i /> RADAR ACTIF</span>
          <button type="button" className={soundsEnabled ? "active" : ""} onClick={onToggleSounds} aria-label={soundsEnabled ? "Couper les sons" : "Activer les sons"}><strong>SON</strong><small>{soundsEnabled ? "ON" : "OFF"}</small></button>
        </div>
      </header>

      <main className="aircraft-standby-main">
        <div className="aircraft-standby-radar" aria-hidden="true">
          <i className="aircraft-standby-sweep" />
          <i className="aircraft-standby-axis horizontal" />
          <i className="aircraft-standby-axis vertical" />
          <b className="aircraft-standby-home">⌂</b>
          <span className="aircraft-standby-blip one" />
          <span className="aircraft-standby-blip two" />
        </div>
        <div className="aircraft-standby-message">
          <span>RECHERCHE EN CONTINU</span>
          <h1>Aucun avion<br />pour le moment</h1>
          <p>Dès qu’un appareil entre dans votre zone, sa photo, sa compagnie et son trajet s’affichent automatiquement.</p>
          <div><i /> Surveillance de <strong>{radiusKm} km</strong> autour de votre point</div>
        </div>
      </main>

    </div>

    <footer className="aircraft-standby-footer">
      <article><span>⌖</span><div><small>POINT SURVEILLÉ</small><strong>{observerLabel}</strong><p>{observerPosition ? `${observerPosition[0].toFixed(5)} / ${observerPosition[1].toFixed(5)}` : "Position en attente"}</p></div></article>
      <article><span>◎</span><div><small>RAYON DU RADAR</small><strong>{radiusKm} km</strong><p>Recherche actualisée automatiquement</p></div></article>
      <article><span>↗</span><div><small>PROCHAINE APPARITION</small><strong>Bascule automatique</strong><p>{sourceStatus}</p></div></article>
    </footer>
  </div>;
}
