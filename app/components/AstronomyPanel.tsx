const passes = [
  {
    id: "iss",
    icon: "🛰️",
    title: "ISS",
    time: "19 h 49",
    altitude: "35° max",
    countdown: "2 h 20",
    direction: "Ouest → Est",
    quality: "Bon",
    duration: "5 min"
  },
  {
    id: "starlink",
    icon: "✨",
    title: "Starlink récent",
    time: "21 h 25",
    altitude: "12° max",
    countdown: "3 h 56",
    direction: "Nord-Ouest → Est",
    quality: "Moyen",
    duration: "4 min"
  },
  {
    id: "isis1",
    icon: "🛰️",
    title: "ISIS 1",
    time: "22 h 17",
    altitude: "40° max",
    countdown: "4 h 48",
    direction: "Sud-Ouest → Nord-Est",
    quality: "Faible",
    duration: "3 min"
  },
  {
    id: "sl8",
    icon: "🛰️",
    title: "SL-8 R/B",
    time: "23 h 02",
    altitude: "23° max",
    countdown: "5 h 33",
    direction: "Ouest → Sud-Est",
    quality: "Variable",
    duration: "2 min"
  }
];

const planets = [
  { id: "moon", icon: "🌙", name: "Lune", visibility: "Visible dès le coucher du Soleil", direction: "Sud-Ouest" },
  { id: "jupiter", icon: "✨", name: "Jupiter", visibility: "Observable après 02 h 00", direction: "Est" },
  { id: "saturn", icon: "🪐", name: "Saturne", visibility: "Visible en fin de nuit", direction: "Sud-Est" },
  { id: "mars", icon: "🔴", name: "Mars", visibility: "Faible cette nuit", direction: "Est" }
];

export default function AstronomyPanel() {
  return (
    <>
      <section className="hero astronomy-dashboard-hero">
        <div>
          <span className="eyebrow">CIEL EN DIRECT</span>
          <h1>Tableau de bord astronomique</h1>
          <p>Prévisions orbitales adaptées à votre géolocalisation actuelle.</p>
        </div>
        <div className="position-card"><span>Position utilisée</span><strong>46.346°, 4.977°</strong></div>
      </section>

      <section className="panel space-passages">
        <div className="panel-title">
          <div><h3>Passages spatiaux</h3><p className="muted">ISS, Starlink et satellites brillants au-dessus de votre position</p></div>
          <span className="orbit-pill">ORBITE LIVE</span>
        </div>

        <div className="iss-main-card">
          <div className="satellite-orbit-icon">🛰️</div>
          <div>
            <span>PROCHAIN PASSAGE ISS</span>
            <strong>2 h 20</strong>
            <small>19:49 • élévation 35° • Bon</small>
          </div>
        </div>

        <div className="pass-cards">
          {passes.map(pass => (
            <article key={pass.id}>
              <span className="pass-icon">{pass.icon}</span>
              <div className="grow"><strong>{pass.title}</strong><small>{pass.time} • {pass.altitude}</small></div>
              <strong className="green">{pass.countdown}</strong>
            </article>
          ))}
        </div>
        <p className="tiny-note">Prévision orbitale indicative : la visibilité réelle dépend de la nuit, des nuages et de l’éclairage du satellite.</p>
      </section>

      <section className="astro-metrics">
        <article className="panel"><span>🛰️ Recalcul orbital</span><strong>Toutes les 10 min</strong></article>
        <article className="panel"><span>📍 Géolocalisation</span><strong>Position HOME</strong></article>
        <article className="panel"><span>☁️ Couverture nuageuse</span><strong>84 %</strong></article>
        <article className="panel"><span>👁️ Visibilité</span><strong>54 km</strong></article>
        <article className="panel"><span>🏳️ Vent local</span><strong>3 km/h</strong></article>
        <article className="panel"><span>🌡️ Température</span><strong>38 °C</strong></article>
      </section>

      <section className="astronomy-lower-grid">
        <article className="panel">
          <span className="eyebrow">EN RÉSUMÉ</span>
          <h3>Ce qu’il faut regarder ce soir</h3>
          <p className="astro-summary">
            Le ciel est assez couvert en début de soirée. Le passage de l’ISS reste l’événement principal à surveiller.
            Une amélioration est possible plus tard dans la nuit. Les passages Starlink sont indiqués avec leurs horaires,
            mais leur visibilité dépendra fortement des nuages.
          </p>
        </article>

        <article className="panel">
          <span className="eyebrow">PLANÈTES ET LUNE</span>
          <div className="planet-list">
            {planets.map(planet => (
              <div key={planet.id} className="planet-row">
                <span className="planet-icon">{planet.icon}</span>
                <div className="grow"><strong>{planet.name}</strong><small>{planet.visibility}</small></div>
                <span className="planet-direction">{planet.direction}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
