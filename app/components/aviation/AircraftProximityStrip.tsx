import type { AircraftProximitySummary } from "../../lib/aviation/proximitySummary";

type Props = {
  className?: string;
  proximity: AircraftProximitySummary;
};

function aircraftLabel(count: number) {
  return count === 1 ? "appareil" : "appareils";
}

function distanceLabel(distanceKm: number | null) {
  return distanceKm === null ? "—" : `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

export default function AircraftProximityStrip({ className = "", proximity }: Props) {
  const zones = [
    { label: "≤ 10 KM", count: proximity.within10Km },
    { label: "≤ 15 KM", count: proximity.within15Km },
    { label: "≤ 20 KM", count: proximity.within20Km }
  ];

  return <section
    className={`aircraft-proximity-strip${className ? ` ${className}` : ""}`}
    aria-label={`Avion le plus proche à ${distanceLabel(proximity.nearestDistanceKm)}. ${proximity.within10Km} dans 10 kilomètres, ${proximity.within15Km} dans 15 kilomètres et ${proximity.within20Km} dans 20 kilomètres.`}
  >
    <article className="nearest">
      <span>✈ LE PLUS PROCHE</span>
      <strong>{distanceLabel(proximity.nearestDistanceKm)}</strong>
      <small>{proximity.nearestLabel ?? "Radar en veille"}</small>
    </article>
    {zones.map((zone) => <article key={zone.label}>
      <span>{zone.label}</span>
      <strong>{zone.count}</strong>
      <small>{aircraftLabel(zone.count)}</small>
    </article>)}
  </section>;
}
