"use client";

import dynamic from "next/dynamic";

const StableMap = dynamic(() => import("./StableMap"), { ssr: false });

export default function DronePanel() {
  return (
    <>
      <section className="hero drone-hero">
        <div>
          <span className="eyebrow">DRONE SDIS 71</span>
          <h1><span className="drone-title-icon">⌁</span> Décision avant décollage</h1>
          <p>Carte centrée sur la Saône-et-Loire avec affichage permanent des zones RTBA.</p>
        </div>

        <div className="flight-decision warning">
          <span>⚠️</span>
          <div>
            <strong>RTBA À VÉRIFIER</strong>
            <small>Les zones restent visibles même lorsqu’elles sont inactives.</small>
          </div>
        </div>
      </section>

      <section className="drone-layout">
        <div className="drone-main">
          <article className="panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">ESPACE AÉRIEN 71</span>
                <h3>Zones RTBA en Saône-et-Loire</h3>
                <p className="muted">Aucun NOTAM n’est affiché dans cet onglet.</p>
              </div>
              <span className="rtba-visible-badge">RTBA TOUJOURS VISIBLES</span>
            </div>

            <div className="drone-map-small drone-map-71">
              <StableMap
                points={[
                  {
                    id: "position",
                    lat: 46.64,
                    lon: 4.50,
                    name: "Position",
                    detail: "Position de référence",
                    color: "#4da3ff",
                    icon: "📍",
                    category: "home"
                  }
                ]}
                zones={[
                  {
                    id: "rtba-r45",
                    name: "RTBA R45",
                    status: "inactive",
                    floor: "800 ft AMSL",
                    ceiling: "2 700 ft AMSL",
                    positions: [
                      [46.20, 3.90],
                      [46.56, 3.86],
                      [46.82, 4.30],
                      [46.54, 4.72],
                      [46.18, 4.46]
                    ]
                  },
                  {
                    id: "rtba-r46",
                    name: "RTBA R46",
                    status: "unknown",
                    floor: "800 ft AMSL",
                    ceiling: "3 200 ft AMSL",
                    positions: [
                      [46.64, 4.42],
                      [47.02, 4.52],
                      [47.13, 5.05],
                      [46.78, 5.35],
                      [46.52, 4.94]
                    ]
                  },
                  {
                    id: "rtba-r47",
                    name: "RTBA R47",
                    status: "active",
                    floor: "1 000 ft AMSL",
                    ceiling: "4 500 ft AMSL",
                    positions: [
                      [46.12, 4.68],
                      [46.42, 4.78],
                      [46.55, 5.28],
                      [46.20, 5.44],
                      [45.98, 5.02]
                    ]
                  }
                ]}
                center={[46.64, 4.55]}
                zoom={8}
              />
            </div>
          </article>

          <article className="panel rtba-list-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">SITUATION RTBA</span>
                <h3>État des zones affichées</h3>
              </div>
            </div>

            <div className="rtba-status-list">
              <article className="rtba-status inactive">
                <span className="rtba-status-dot" />
                <div>
                  <strong>R45 — INACTIVE</strong>
                  <small>Visible avec contour orange fin</small>
                </div>
              </article>

              <article className="rtba-status unknown">
                <span className="rtba-status-dot" />
                <div>
                  <strong>R46 — NON VÉRIFIÉE</strong>
                  <small>Visible avec contour gris discontinu</small>
                </div>
              </article>

              <article className="rtba-status active">
                <span className="rtba-status-dot" />
                <div>
                  <strong>R47 — ACTIVE</strong>
                  <small>Visible en rouge avec remplissage renforcé</small>
                </div>
              </article>
            </div>
          </article>
        </div>

        <aside className="drone-side">
          <article className="panel compact">
            <span className="eyebrow">SYNTHÈSE DE VOL</span>
            <div className="check-list">
              <div className="check warning"><span />RTBA : 1 zone active</div>
              <div className="check ok"><span />Carte centrée sur le département 71</div>
              <div className="check ok"><span />Espace aérien : classe G</div>
              <div className="check ok"><span />Vent : 14 km/h</div>
              <div className="check ok"><span />Rafales : 24 km/h</div>
              <div className="check ok"><span />Visibilité : supérieure à 10 km</div>
            </div>
          </article>

          <article className="panel compact">
            <span className="eyebrow">MÉTÉO</span>
            <div className="info-list">
              <div><span>Température</span><strong>24 °C</strong></div>
              <div><span>Humidité</span><strong>48 %</strong></div>
              <div><span>Pression</span><strong>1 017 hPa</strong></div>
              <div><span>Pluie</span><strong>0 mm</strong></div>
            </div>
          </article>

          <article className="panel compact">
            <span className="eyebrow">LÉGENDE</span>
            <div className="rtba-legend">
              <div><span className="legend-line active" /> Active</div>
              <div><span className="legend-line inactive" /> Inactive</div>
              <div><span className="legend-line unknown" /> Non vérifiée</div>
            </div>
          </article>

          <article className="panel compact">
            <span className="eyebrow">SOURCES OFFICIELLES</span>
            <div className="official-links">
              <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer">
                AZBA / activité RTBA
              </a>
              <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer">
                SIA France
              </a>
              <a href="https://www.geoportail.gouv.fr/donnees/restrictions-uas-categorie-ouverte-et-aeromodelisme" target="_blank" rel="noreferrer">
                Restrictions UAS Géoportail
              </a>
            </div>
          </article>

          <article className="panel compact">
            <span className="eyebrow">AVERTISSEMENT</span>
            <p className="muted">
              Les formes RTBA restent des données de démonstration. Le statut
              opérationnel doit être confirmé sur la page AZBA officielle du SIA.
            </p>
          </article>
        </aside>
      </section>
    </>
  );
}
