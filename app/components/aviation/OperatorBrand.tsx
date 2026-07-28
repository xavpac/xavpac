"use client";

import { useEffect, useState } from "react";

type Props = { name?: string | null; logoUrl?: string | null; className?: string };

export default function OperatorBrand({ name, logoUrl, className }: Props) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  useEffect(() => setFailedLogo(null), [logoUrl]);
  const label = name?.trim() || "Opérateur non identifié";
  return <div className={`operator-brand ${className ?? ""}`}>
    {logoUrl && failedLogo !== logoUrl
      ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={`Logo ${label}`} onError={() => setFailedLogo(logoUrl)} />
      </>
      : <span className="operator-brand-monogram" aria-hidden="true">{label.slice(0, 2).toUpperCase()}</span>}
    <strong>{label}</strong>
  </div>;
}
