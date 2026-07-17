"use client";

import type { Aircraft } from "../types";

export default function MiniRadar({ aircraft }: { aircraft: Aircraft[] }) {
  const dots = aircraft.slice(0, 12).map((item, index) => {
    const distanceRatio = Math.min(item.distanceKm / 50, 1);
    const angle = ((item.bearingDeg - 90) * Math.PI) / 180;
    const radius = 39 * distanceRatio;
    return {
      id: item.id,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      active: index === 0,
    };
  });

  return (
    <div className="radar-shell">
      <svg className="radar-svg" viewBox="0 0 100 100" role="img" aria-label="Mini radar local">
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0b3c40" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#001015" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00e8d2" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#00e8d2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="url(#radarGlow)" stroke="#1d5160" strokeWidth="1" />
        <circle cx="50" cy="50" r="31" fill="none" stroke="#166477" strokeWidth="0.7" opacity="0.75" />
        <circle cx="50" cy="50" r="16" fill="none" stroke="#166477" strokeWidth="0.7" opacity="0.75" />
        <path d="M50 50 L50 3 A47 47 0 0 1 84 17 Z" fill="url(#sweep)" opacity="0.55" />
        <line x1="50" y1="3" x2="50" y2="97" stroke="#156073" strokeWidth="0.5" />
        <line x1="3" y1="50" x2="97" y2="50" stroke="#156073" strokeWidth="0.5" />
        {dots.map((dot) => (
          <g key={dot.id}>
            <circle cx={dot.x} cy={dot.y} r={dot.active ? 2.6 : 1.8} fill={dot.active ? "#31e9ff" : "#80cfff"} />
            {dot.active ? <circle cx={dot.x} cy={dot.y} r="5" fill="none" stroke="#31e9ff" strokeWidth="0.7" opacity="0.5" /> : null}
          </g>
        ))}
        <circle cx="50" cy="50" r="3.2" fill="#ff4a63" />
      </svg>
    </div>
  );
}
