export type AzbaActivationState = "active" | "soon" | "planned" | "inactive" | "unknown";

export type AzbaActivationSlot = {
  startUtc: string;
  endUtc: string;
};

export type AzbaLiveZone = {
  code: string;
  state: AzbaActivationState;
  activeNow: boolean;
  nextActivationUtc: string | null;
  activations: AzbaActivationSlot[];
};

export type AzbaLiveFeed = {
  source: "SIA/AZBA officiel";
  retrievedAt: string;
  validityStartUtc: string | null;
  validityEndUtc: string | null;
  state: "available" | "unavailable";
  message: string;
  zones: AzbaLiveZone[];
};

export function normalizeRtbaCode(value: string) {
  return value
    .toUpperCase()
    .replace(/^LF/, "")
    .replace(/[^A-Z0-9.]/g, "");
}

export function classifyAzbaSlots(
  slots: AzbaActivationSlot[],
  nowMs = Date.now(),
  validityStartMs: number | null = null,
  validityEndMs: number | null = null
): Pick<AzbaLiveZone, "state" | "activeNow" | "nextActivationUtc"> {
  const parsed = slots
    .map((slot) => ({
      ...slot,
      startMs: new Date(slot.startUtc).getTime(),
      endMs: new Date(slot.endUtc).getTime()
    }))
    .filter((slot) => Number.isFinite(slot.startMs) && Number.isFinite(slot.endMs) && slot.endMs > slot.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (
    validityStartMs !== null &&
    validityEndMs !== null &&
    (!Number.isFinite(validityStartMs) || !Number.isFinite(validityEndMs) || nowMs < validityStartMs || nowMs > validityEndMs)
  ) {
    return { state: "unknown", activeNow: false, nextActivationUtc: parsed.find((slot) => slot.startMs > nowMs)?.startUtc ?? null };
  }

  const active = parsed.find((slot) => slot.startMs <= nowMs && nowMs < slot.endMs);
  if (active) {
    return { state: "active", activeNow: true, nextActivationUtc: active.startUtc };
  }

  const next = parsed.find((slot) => slot.startMs > nowMs);
  if (next) {
    const deltaMs = next.startMs - nowMs;
    return {
      state: deltaMs <= 4 * 60 * 60 * 1000 ? "soon" : "planned",
      activeNow: false,
      nextActivationUtc: next.startUtc
    };
  }

  return { state: "inactive", activeNow: false, nextActivationUtc: null };
}
