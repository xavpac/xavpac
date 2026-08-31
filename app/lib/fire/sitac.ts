import { isCoordinatePair } from "../safeStorage.ts";

export const SITAC_CATEGORIES = ["incident", "command", "access", "water", "drone", "watch"] as const;
export type SitacCategory = (typeof SITAC_CATEGORIES)[number];

export type SitacPoint = {
  id: string;
  category: SitacCategory;
  label: string;
  position: [number, number];
  createdAt: string;
};

export const SITAC_CATEGORY_DETAILS: Record<SitacCategory, { label: string; icon: string; color: string }> = {
  incident: { label: "Point d’intervention", icon: "🔥", color: "#ff665f" },
  command: { label: "PC / commandement", icon: "◆", color: "#56a8ff" },
  access: { label: "Accès", icon: "↗", color: "#ffc35a" },
  water: { label: "Point d’eau", icon: "●", color: "#38c9f2" },
  drone: { label: "Point Drone", icon: "+", color: "#b78cff" },
  watch: { label: "Zone à surveiller", icon: "◎", color: "#55dda0" }
};

export function isSitacPoint(value: unknown): value is SitacPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && candidate.id.length > 0
    && typeof candidate.label === "string" && candidate.label.length > 0 && candidate.label.length <= 120
    && typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.category === "string" && (SITAC_CATEGORIES as readonly string[]).includes(candidate.category)
    && isCoordinatePair(candidate.position);
}

export function isSitacPointArray(value: unknown): value is SitacPoint[] {
  return Array.isArray(value) && value.length <= 100 && value.every(isSitacPoint);
}
