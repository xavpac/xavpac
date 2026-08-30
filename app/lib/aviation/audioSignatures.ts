export type AviationSoundTone = {
  offsetSeconds: number;
  frequencyHz: number;
  durationSeconds: number;
  peakGain: number;
  wave: "sine" | "triangle" | "square" | "sawtooth";
};

export type AviationSoundNature = "commercial" | "helicopter" | "medical" | "fire" | "military" | "airship" | "light" | "generic";

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

const AIRCRAFT_NATURE_SIGNATURES: Record<AviationSoundNature, readonly AviationSoundTone[]> = {
  commercial: AIRCRAFT_CHANGE_SIGNATURE,
  generic: AIRCRAFT_CHANGE_SIGNATURE,
  helicopter: [
    { offsetSeconds: 0, frequencyHz: 310, durationSeconds: .13, peakGain: .038, wave: "triangle" },
    { offsetSeconds: .16, frequencyHz: 310, durationSeconds: .13, peakGain: .038, wave: "triangle" }
  ],
  medical: [
    { offsetSeconds: 0, frequencyHz: 520, durationSeconds: .12, peakGain: .04, wave: "sine" },
    { offsetSeconds: .13, frequencyHz: 690, durationSeconds: .12, peakGain: .04, wave: "sine" },
    { offsetSeconds: .26, frequencyHz: 520, durationSeconds: .14, peakGain: .035, wave: "sine" }
  ],
  fire: [
    { offsetSeconds: 0, frequencyHz: 760, durationSeconds: .18, peakGain: .04, wave: "triangle" },
    { offsetSeconds: .12, frequencyHz: 560, durationSeconds: .24, peakGain: .04, wave: "triangle" }
  ],
  military: [
    { offsetSeconds: 0, frequencyHz: 440, durationSeconds: .12, peakGain: .04, wave: "square" },
    { offsetSeconds: .1, frequencyHz: 660, durationSeconds: .18, peakGain: .035, wave: "square" }
  ],
  airship: [
    { offsetSeconds: 0, frequencyHz: 330, durationSeconds: .4, peakGain: .024, wave: "sine" },
    { offsetSeconds: .22, frequencyHz: 440, durationSeconds: .48, peakGain: .022, wave: "sine" }
  ],
  light: [
    { offsetSeconds: 0, frequencyHz: 700, durationSeconds: .11, peakGain: .035, wave: "sine" },
    { offsetSeconds: .08, frequencyHz: 900, durationSeconds: .11, peakGain: .03, wave: "sine" },
    { offsetSeconds: .16, frequencyHz: 760, durationSeconds: .13, peakGain: .028, wave: "sine" }
  ]
};

export function aircraftSoundNature(...values: Array<string | null | undefined>): AviationSoundNature {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/(samu|smur|medical|médical)/i.test(text)) return "medical";
  if (/(canadair|dash|fire boss|at-?802|bombardier d.eau|p[ée]lican|bengale|milan)/i.test(text)) return "fire";
  if (/(airship|dirigeable|zeppelin|\bzep\b)/i.test(text)) return "airship";
  if (/(helic|hélic|rotor|dragon|condor|h125|h135|h145|ec135|ec145|as50)/i.test(text)) return "helicopter";
  if (/(military|militaire|armée|air force|rafale|mirage|a400m|mrtt)/i.test(text)) return "military";
  if (/(cessna|piper|robin|cirrus|ulm|ultralight|glider|planeur)/i.test(text)) return "light";
  if (/(airbus|boeing|airliner|a3\d\d|b7\d\d)/i.test(text)) return "commercial";
  return "generic";
}

export function aircraftChangeSignature(nature: AviationSoundNature) {
  return AIRCRAFT_NATURE_SIGNATURES[nature];
}
