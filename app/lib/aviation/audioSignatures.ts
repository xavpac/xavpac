export type AviationSoundTone = {
  offsetSeconds: number;
  frequencyHz: number;
  durationSeconds: number;
  peakGain: number;
  wave: "sine" | "triangle" | "square" | "sawtooth";
};

export const AIRCRAFT_CHANGE_SIGNATURE: readonly AviationSoundTone[] = [
  { offsetSeconds: 0, frequencyHz: 620, durationSeconds: .16, peakGain: .045, wave: "sine" },
  { offsetSeconds: .095, frequencyHz: 820, durationSeconds: .16, peakGain: .045, wave: "sine" }
];

// Accord doux Sol–Si–Ré : plus long et moins fort que le changement d’avion.
export const NATIONAL_ASSET_SIGNATURE: readonly AviationSoundTone[] = [
  { offsetSeconds: 0, frequencyHz: 392, durationSeconds: .38, peakGain: .03, wave: "triangle" },
  { offsetSeconds: .17, frequencyHz: 493.88, durationSeconds: .38, peakGain: .03, wave: "triangle" },
  { offsetSeconds: .34, frequencyHz: 587.33, durationSeconds: .44, peakGain: .032, wave: "triangle" }
];

