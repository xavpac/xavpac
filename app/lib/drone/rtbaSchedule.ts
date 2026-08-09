import type { RtbaAssessment } from "../aviation/rtba.ts";

export type RtbaActivationSlot = {
  zoneId: string;
  startsAt: string;
  endsAt: string;
};

export type RtbaActivationFeed = {
  state: "ready" | "unavailable" | "invalid";
  source: string;
  publishedAt: string | null;
  retrievedAt: string | null;
  coverageStartsAt: string | null;
  coverageEndsAt: string | null;
  slots: RtbaActivationSlot[] | null;
  message?: string;
};

export type RtbaMissionStatus = {
  code: "active-now" | "mission-overlap" | "inactive-next" | "no-slot" | "finished" | "tomorrow" | "below-floor" | "outside-local" | "unconfirmed";
  severity: "blocking" | "check" | "clear" | "unconfirmed";
  label: string;
  detail: string;
  previous: RtbaActivationSlot | null;
  current: RtbaActivationSlot | null;
  next: RtbaActivationSlot | null;
  overlapMinutes: number;
};

function milliseconds(value: string | null) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function zoneKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function localDay(epochMs: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochMs));
}

const EMPTY = { previous: null, current: null, next: null, overlapMinutes: 0 } as const;

export function evaluateRtbaMission(assessment: RtbaAssessment | null, feed: RtbaActivationFeed, missionStartMs: number, missionEndMs: number, nowMs = Date.now()): RtbaMissionStatus {
  if (!assessment || assessment.level === "coverage-unavailable") return {
    code: "unconfirmed", severity: "unconfirmed", label: "STATUT RTBA NON CONFIRMÉ",
    detail: assessment ? "La géométrie RTBA embarquée ne couvre pas suffisamment ce point." : "Le point MISSION est requis.", ...EMPTY
  };
  if (assessment.level === "outside-local") return {
    code: "outside-local", severity: "check", label: "AUCUN CONTOUR LF-R45 LOCAL AU POINT",
    detail: "Conclusion limitée aux secteurs LF-R45 embarqués ; contrôlez la carte nationale officielle.", ...EMPTY
  };
  const affectingZones = assessment.matches.filter((zone) => zone.affectsRequestedHeight);
  if (!affectingZones.length) return {
    code: "below-floor", severity: "clear", label: "HAUTEUR SOUS LE PLANCHER DU VOLUME",
    detail: "Le point est dans le contour horizontal, mais la hauteur MISSION reste sous le plancher publié.", ...EMPTY
  };
  const retrievedAt = milliseconds(feed.retrievedAt);
  const stale = retrievedAt === null || nowMs - retrievedAt > 20 * 60_000;
  if (feed.state !== "ready" || !feed.slots || stale) return {
    code: "unconfirmed", severity: "unconfirmed", label: "STATUT RTBA NON CONFIRMÉ",
    detail: stale && feed.retrievedAt ? "La dernière donnée officielle est trop ancienne." : feed.message ?? "Aucun accès autorisé aux créneaux officiels AZBA n’est configuré.", ...EMPTY
  };
  const coverageStart = milliseconds(feed.coverageStartsAt);
  const coverageEnd = milliseconds(feed.coverageEndsAt);
  if (coverageStart === null || coverageEnd === null || missionStartMs < coverageStart || missionEndMs > coverageEnd) return {
    code: "unconfirmed", severity: "unconfirmed", label: "STATUT RTBA NON CONFIRMÉ",
    detail: "La mission se situe hors de la période officielle connue.", ...EMPTY
  };
  const ids = new Set(affectingZones.map((zone) => zoneKey(zone.id)));
  const slots = feed.slots.map((slot) => ({ ...slot, startMs: milliseconds(slot.startsAt), endMs: milliseconds(slot.endsAt) }))
    .filter((slot): slot is RtbaActivationSlot & { startMs: number; endMs: number } => ids.has(zoneKey(slot.zoneId)) && slot.startMs !== null && slot.endMs !== null && slot.endMs > slot.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const previous = [...slots].reverse().find((slot) => slot.endMs <= nowMs) ?? null;
  const current = slots.find((slot) => slot.startMs <= nowMs && slot.endMs > nowMs) ?? null;
  const next = slots.find((slot) => slot.startMs > nowMs) ?? null;
  const overlaps = slots.filter((slot) => slot.startMs < missionEndMs && slot.endMs > missionStartMs);
  const overlapMinutes = Math.round(overlaps.reduce((total, slot) => total + Math.max(0, Math.min(slot.endMs, missionEndMs) - Math.max(slot.startMs, missionStartMs)), 0) / 60_000);
  const missionIsCurrent = missionStartMs <= nowMs && missionEndMs > nowMs;
  const strip = (slot: typeof current): RtbaActivationSlot | null => slot ? { zoneId: slot.zoneId, startsAt: slot.startsAt, endsAt: slot.endsAt } : null;
  const timeline = { previous: strip(previous), current: strip(current), next: strip(next), overlapMinutes };
  if (current && missionIsCurrent && overlaps.some((slot) => slot.zoneId === current.zoneId && slot.startsAt === current.startsAt && slot.endsAt === current.endsAt)) return { code: "active-now", severity: "blocking", label: "CRÉNEAU OFFICIEL ACTIF MAINTENANT", detail: `${current.zoneId} est dans un créneau officiel d’activation RTBA en cours.`, ...timeline };
  if (overlaps.length) return { code: "mission-overlap", severity: "blocking", label: "ACTIVATION PENDANT LA MISSION", detail: `${overlaps[0].zoneId} chevauche la mission pendant ${overlapMinutes} min.`, ...timeline };
  if (!missionIsCurrent) return { code: "no-slot", severity: "clear", label: "AUCUN CRÉNEAU PUBLIÉ POUR LA MISSION", detail: "Aucun créneau des volumes concernés ne chevauche la mission planifiée dans la période officielle connue.", ...timeline };
  if (next && localDay(next.startMs) === localDay(missionStartMs)) return { code: "inactive-next", severity: "check", label: "INACTIF ACTUELLEMENT", detail: `Prochaine activation officielle de ${next.zoneId} à ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(next.startMs))}.`, ...timeline };
  if (next && localDay(next.startMs) !== localDay(nowMs)) return { code: "tomorrow", severity: "check", label: "PROCHAINE ACTIVATION ULTÉRIEURE", detail: `Prochain créneau officiel connu : ${next.zoneId}, ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(next.startMs))}.`, ...timeline };
  if (previous && localDay(previous.endMs) === localDay(nowMs)) return { code: "finished", severity: "clear", label: "ACTIVATIONS TERMINÉES POUR AUJOURD’HUI", detail: "Aucun autre créneau n’est publié dans la période officielle connue.", ...timeline };
  return { code: "no-slot", severity: "clear", label: "AUCUN CRÉNEAU PUBLIÉ POUR LA MISSION", detail: "La période officielle reçue ne contient aucun créneau pour les volumes concernés.", ...timeline };
}
