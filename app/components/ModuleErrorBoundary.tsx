"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ModuleId } from "../config/navigation";
import { resetModulePreferences } from "../lib/safeStorage";

type Props = {
  module: ModuleId;
  children: ReactNode;
};

type State = {
  error: Error | null;
  retryKey: number;
};

const moduleNames: Partial<Record<ModuleId, string>> = {
  aviation: "Aviation",
  operations: "Moyens aériens",
  spotting: "Carnet de spotting",
  drone: "Drone",
  center: "Opérations",
  weather: "Météo",
  astronomy: "Ciel",
  technical: "Informations techniques"
};

export default class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[XavPac] Module ${this.props.module} indisponible`, error, info.componentStack);
  }

  retry = () => {
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  resetPreferences = () => {
    resetModulePreferences(this.props.module);
    this.retry();
  };

  render() {
    if (!this.state.error) return <div key={this.state.retryKey} className="module-boundary-content">{this.props.children}</div>;
    const name = moduleNames[this.props.module] ?? "XavPac";
    return (
      <section className="module-error-boundary panel" role="alert">
        <span aria-hidden="true">⚠</span>
        <div>
          <p>MODULE INDISPONIBLE</p>
          <h2>{name} a rencontré une erreur</h2>
          <p>Le reste de XavPac reste disponible. Vous pouvez réessayer sans perdre vos données enregistrées.</p>
          <div>
            <button type="button" onClick={this.retry}>Réessayer</button>
            <button type="button" className="secondary" onClick={this.resetPreferences}>Réinitialiser les préférences {name}</button>
          </div>
        </div>
      </section>
    );
  }
}
