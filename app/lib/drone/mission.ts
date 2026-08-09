import { isCoordinatePair } from "../safeStorage.ts";

export const DRONE_TIME_ZONE = "Europe/Paris";

export type StoredDroneMission = {
  reference: "moi" | "home" | "manual";
  point: [number, number] | null;
  heightMeters: number;
  nowMode: boolean;
  date: string;
  startTime: string;
  endTime: string;
};

export type MissionWindowInput = {
  date: string;
  startTime: string;
  endTime: string;
  nowMode: boolean;
  nowMs?: number;
  nowDurationMinutes?: number;
  timeZone?: string;
};

export type MissionWindow = {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  isNow: boolean;
  durationMinutes: number;
};

export function normalizeStoredDroneMission(value: unknown): StoredDroneMission | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.reference !== "moi" && candidate.reference !== "home" && candidate.reference !== "manual") return null;
  const point = candidate.point === null ? null : isCoordinatePair(candidate.point) ? candidate.point : null;
  if (candidate.reference !== "moi" && point === null) return null;
  const heightMeters = typeof candidate.heightMeters === "number" ? candidate.heightMeters : Number(candidate.heightMeters);
  if (!Number.isFinite(heightMeters) || heightMeters < 0 || heightMeters > 500) return null;
  if (typeof candidate.nowMode !== "boolean" || typeof candidate.date !== "string" || typeof candidate.startTime !== "string" || typeof candidate.endTime !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) || !/^\d{2}:\d{2}$/.test(candidate.startTime) || !/^\d{2}:\d{2}$/.test(candidate.endTime)) return null;
  return { reference: candidate.reference, point, heightMeters, nowMode: candidate.nowMode, date: candidate.date, startTime: candidate.startTime, endTime: candidate.endTime };
}

function localParts(epochMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

export function zonedDateTimeToUtcMs(date: string, time: string, timeZone = DRONE_TIME_ZONE): number | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const wanted = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: 0
  };
  if (wanted.month < 1 || wanted.month > 12 || wanted.day < 1 || wanted.day > 31 || wanted.hour > 23 || wanted.minute > 59) return null;
  const wallClockAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, 0);
  let candidate = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = localParts(candidate, timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    candidate += wallClockAsUtc - shownAsUtc;
  }
  const verified = localParts(candidate, timeZone);
  if (verified.year !== wanted.year || verified.month !== wanted.month || verified.day !== wanted.day || verified.hour !== wanted.hour || verified.minute !== wanted.minute) return null;
  return candidate;
}

export function resolveMissionWindow(input: MissionWindowInput): MissionWindow | null {
  const nowMs = input.nowMs ?? Date.now();
  if (input.nowMode) {
    const durationMinutes = Math.max(5, Math.min(12 * 60, Math.round(input.nowDurationMinutes ?? 45)));
    const endMs = nowMs + durationMinutes * 60_000;
    return { startMs: nowMs, endMs, startIso: new Date(nowMs).toISOString(), endIso: new Date(endMs).toISOString(), isNow: true, durationMinutes };
  }
  const startMs = zonedDateTimeToUtcMs(input.date, input.startTime, input.timeZone);
  const endMs = zonedDateTimeToUtcMs(input.date, input.endTime, input.timeZone);
  if (startMs === null || endMs === null || endMs <= startMs || endMs - startMs > 12 * 60 * 60_000) return null;
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    isNow: false,
    durationMinutes: Math.round((endMs - startMs) / 60_000)
  };
}

export function formatMissionLocal(epochMs: number, timeZone = DRONE_TIME_ZONE) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(epochMs));
}
