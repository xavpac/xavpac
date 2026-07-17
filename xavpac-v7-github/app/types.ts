export type ModuleId = "aviation" | "national";

export type Aircraft = {
  id: string;
  hex: string;
  callsign: string;
  registration: string;
  type: string;
  typeLabel: string;
  operator: string;
  category: "airliner" | "helicopter" | "water-bomber" | "military" | "medical" | "other";
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  distanceKm: number;
  bearingDeg: number;
  onGround: boolean;
  route?: {
    fromCode: string;
    fromName: string;
    fromCountry: string;
    toCode: string;
    toName: string;
    toCountry: string;
    departureLocal: string;
    arrivalLocal: string;
    duration: string;
  };
  mission?: string;
  source: string;
  lastSeen: string;
};

export type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};
