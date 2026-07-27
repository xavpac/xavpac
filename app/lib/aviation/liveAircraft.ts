export type LiveAircraft = {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  barometricAltitude: number | null;
  geometricAltitude?: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate?: number | null;
  onGround: boolean;
  squawk?: string | null;
  registration?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
  category?: string | null;
  positionSource?: string;
  lastPositionAt?: string | null;
  positionAgeSeconds?: number | null;
};

export type AircraftWithDistance = LiveAircraft & { distance: number };
