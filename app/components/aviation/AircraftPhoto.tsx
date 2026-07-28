"use client";

import { useEffect, useState } from "react";
import AircraftTypeIllustration from "./AircraftTypeIllustration";

type Props = {
  identityKey: string;
  photoUrl?: string | null;
  isExact?: boolean;
  label?: string | null;
  source?: string | null;
  photographer?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
  category?: string | null;
  loading?: boolean;
  className?: string;
};

export default function AircraftPhoto(props: Props) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const mediaKey = `${props.identityKey}:${props.photoUrl ?? "none"}`;

  useEffect(() => setFailedKey(null), [mediaKey]);

  const showPhoto = Boolean(props.isExact && props.photoUrl && failedKey !== mediaKey);
  return <div className={`aircraft-photo-frame ${props.className ?? ""}${props.loading ? " loading" : ""}`} aria-busy={props.loading || undefined}>
    {showPhoto ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={mediaKey} src={props.photoUrl ?? undefined} alt={`Photo de l’appareil ${props.identityKey}`} onError={() => setFailedKey(mediaKey)} />
      <small>{props.label ?? "Photo exacte"}{props.source ? ` • ${props.source}` : ""}{props.photographer ? ` • ${props.photographer}` : ""}</small>
    </> : <AircraftTypeIllustration aircraftType={props.aircraftType} description={props.description} operator={props.operator} category={props.category} />}
  </div>;
}
