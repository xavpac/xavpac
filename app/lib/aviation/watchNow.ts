export type WatchNowCandidate = {
  id: string;
  callsign: string;
  distanceKm: number;
  altitudeMeters: number | null;
  onGround: boolean;
  isNational: boolean;
  isRemarkable: boolean;
  isMilitary: boolean;
  isRare: boolean;
  estimatedSecondsToHomePassage: number | null;
};

export type WatchNowItem = WatchNowCandidate & {
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  reason: string;
};

function classify(candidate: WatchNowCandidate): Pick<WatchNowItem, "priority" | "reason"> | null {
  if (candidate.onGround) return null;
  if (candidate.isNational) return { priority: 1, reason: "Moyen national détecté" };
  if (candidate.isRemarkable) return { priority: 2, reason: "Appareil remarquable" };
  if (candidate.isMilitary) return { priority: 3, reason: "Appareil militaire publiquement visible" };
  if (candidate.isRare) return { priority: 4, reason: "Catégorie rare à observer" };
  if (candidate.distanceKm <= 25) return { priority: 5, reason: "Très proche de HOME" };
  if (candidate.altitudeMeters !== null && candidate.altitudeMeters <= 1500) return { priority: 6, reason: "Passage à basse altitude" };
  if (candidate.estimatedSecondsToHomePassage !== null && candidate.estimatedSecondsToHomePassage <= 15 * 60) {
    return { priority: 7, reason: "Passage près de HOME prévu" };
  }
  return null;
}

export function rankWatchNow(candidates: WatchNowCandidate[], limit = 3): WatchNowItem[] {
  return candidates
    .flatMap((candidate) => {
      const classification = classify(candidate);
      return classification ? [{ ...candidate, ...classification }] : [];
    })
    .sort((left, right) => left.priority - right.priority || left.distanceKm - right.distanceKm || left.callsign.localeCompare(right.callsign))
    .slice(0, Math.max(0, Math.min(3, limit)));
}
