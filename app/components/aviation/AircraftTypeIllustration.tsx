import { classifyAircraftVisual } from "../../lib/aviation/aircraftVisual";

type Props = {
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
  category?: string | null;
  compact?: boolean;
};

export default function AircraftTypeIllustration({ aircraftType, description, operator, category, compact = false }: Props) {
  const visual = classifyAircraftVisual(aircraftType, description, operator, category);
  return <div className={`aircraft-type-illustration ${visual.kind}${compact ? " compact" : ""}`} role="img" aria-label={`${visual.label} — illustration du type`}>
    <svg viewBox="0 0 160 100" aria-hidden="true">
      {visual.kind === "water-bomber" && <><path d="M16 52 64 44 75 15h10l10 29 49 8-4 13-45-3-8 25H73l-8-25-45 3Z" /><path className="accent" d="M61 72c0 7-5 11-10 11s-10-4-10-11c0-5 10-17 10-17s10 12 10 17Zm58 0c0 7-5 11-10 11s-10-4-10-11c0-5 10-17 10-17s10 12 10 17Z" /></>}
      {visual.kind === "turboprop" && <><path d="M18 53 67 45 76 19h8l9 26 49 8-4 11-44-2-8 24H74l-8-24-44 2Z" /><circle className="accent-outline" cx="48" cy="53" r="13" /><circle className="accent-outline" cx="112" cy="53" r="13" /></>}
      {(visual.kind === "helicopter" || visual.kind === "medical") && <><path d="M38 54c0-17 12-28 32-28h24c18 0 29 12 29 27v9H56c-10 0-18-2-18-8Zm84-2 28-12v8l-27 17ZM65 66h45l-8 10H73Z" /><path className="outline" d="M30 20h104M81 20V9M46 79h72" />{visual.kind === "medical" && <path className="accent" d="M75 34h12v8h8v12h-8v8H75v-8h-8V42h8Z" />}</>}
      {visual.kind === "military" && <path d="M80 10 96 43l48 18-5 13-45-8-8 23H74l-8-23-45 8-5-13 48-18Z" />}
      {visual.kind === "surveillance" && <><path d="M18 55 68 45 76 19h8l9 26 49 10-5 11-43-3-8 23H74l-8-23-43 3Z" /><path className="accent-outline" d="M104 28c12 3 21 11 25 22M110 16c17 5 31 17 36 33" /></>}
      {visual.kind === "drone" && <><path d="M64 43h32l9 20H55Z" /><path className="outline" d="m64 48-29-18m61 18 29-18M64 55 35 74m61-19 29 19" /><circle className="accent-outline" cx="30" cy="27" r="15" /><circle className="accent-outline" cx="130" cy="27" r="15" /><circle className="accent-outline" cx="30" cy="77" r="15" /><circle className="accent-outline" cx="130" cy="77" r="15" /></>}
      {visual.kind === "airship" && <><path d="M15 47c0-20 24-34 59-34 41 0 70 13 70 31 0 21-32 36-73 36-34 0-56-12-56-33Z" /><path className="accent" d="m72 78 20 14H55z" /><path className="outline" d="M27 34 11 19m16 42L11 78" /></>}
      {visual.kind === "balloon" && <><path d="M80 8c27 0 45 20 45 45 0 21-17 33-31 42H66C52 86 35 74 35 53 35 28 53 8 80 8Z" /><path className="accent" d="M67 84h26l-6 13H73Z" /></>}
      {visual.kind === "civil-security" && <><path d="M80 9 126 25v29c0 22-17 34-46 40-29-6-46-18-46-40V25Z" /><path className="accent" d="M75 27h10v18h18v10H85v18H75V55H57V45h18Z" /></>}
      {(visual.kind === "airliner" || visual.kind === "light" || visual.kind === "specialized") && <><path d="M16 54 66 45 76 15h8l10 30 50 9-5 12-45-3-8 24H74l-8-24-45 3Z" />{visual.kind === "light" && <circle className="accent" cx="80" cy="52" r="6" />}</>}
    </svg>
    {!compact && <small>{visual.label}<b>Illustration du type — pas une photo de l’appareil</b></small>}
  </div>;
}
