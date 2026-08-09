export type RtbaZone = {
  id: string;
  name: string;
  floor: string;
  ceiling: string;
  floorFeetAgl: number;
  positions: [number, number][];
};

export type RtbaMatch = RtbaZone & {
  affectsRequestedHeight: boolean;
  relation: "inside-volume" | "below-floor";
};

export type RtbaAssessment = {
  level: "inside-volume" | "below-floor" | "outside-local" | "coverage-unavailable";
  matches: RtbaMatch[];
  nearest: Array<{ zone: RtbaZone; distanceKm: number }>;
};

export type RtbaMapDisplayStatus = "intersects-height" | "below-floor" | "nearby" | "unknown";

export const RTBA_SOURCE_URL = "https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_09_JUL_2026/FRANCE/AIRAC-2026-07-09/html/eAIP/FR-ENR-5.1-fr-FR.html";
export const RTBA_ACTIVATION_URL = "https://www.sia.aviation-civile.gouv.fr/azbaEx/";
export const RTBA_SOURCE_LABEL = "AIP France ENR 5.1 — AIRAC du 9 juillet 2026";

function dms(value: string) {
  const match = value.match(/^(\d{2,3})°(\d{2})'(\d{2})\"([NSEW])$/);
  if (!match) throw new Error(`Coordonnée DMS invalide : ${value}`);
  const decimal = Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
  return match[4] === "S" || match[4] === "W" ? -decimal : decimal;
}

function polygon(points: Array<[string, string]>): [number, number][] {
  return points.map(([latitude, longitude]) => [dms(latitude), dms(longitude)]);
}

// Secteurs LF-R45 utiles en Bourgogne, Mâconnais et Jura. Les sommets sont
// reproduits depuis l'AIP France ENR 5.1 en vigueur au cycle AIRAC indiqué.
export const RTBA_ZONES: RtbaZone[] = [
  {
    id: "LF R 45 B",
    name: "AUTUNOIS",
    floor: "SFC (sol)",
    ceiling: "800 ft ASFC",
    floorFeetAgl: 0,
    positions: polygon([
      ["47°12'44\"N", "004°21'10\"E"], ["47°08'11\"N", "004°41'05\"E"],
      ["46°48'55\"N", "004°41'50\"E"], ["46°45'07\"N", "004°31'44\"E"],
      ["47°00'47\"N", "004°16'42\"E"], ["47°04'38\"N", "003°40'00\"E"],
      ["47°21'59\"N", "003°36'10\"E"], ["47°29'17\"N", "003°59'43\"E"],
      ["47°23'07\"N", "004°05'48\"E"], ["47°21'27\"N", "004°14'49\"E"],
      ["47°11'50\"N", "004°10'59\"E"]
    ])
  },
  {
    id: "LF R 45 S3",
    name: "YONNE",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "FL 065",
    floorFeetAgl: 800,
    positions: polygon([
      ["47°12'44\"N", "004°21'10\"E"], ["47°08'11\"N", "004°41'05\"E"],
      ["46°48'55\"N", "004°41'50\"E"], ["46°45'07\"N", "004°31'44\"E"],
      ["47°00'47\"N", "004°16'42\"E"], ["47°04'38\"N", "003°40'00\"E"],
      ["47°21'59\"N", "003°36'10\"E"], ["47°29'17\"N", "003°59'43\"E"],
      ["47°23'07\"N", "004°05'48\"E"], ["47°21'27\"N", "004°14'49\"E"],
      ["47°11'50\"N", "004°10'59\"E"]
    ])
  },
  {
    id: "LF R 45 S4",
    name: "MÂCONNAIS OUEST",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "FL 065",
    floorFeetAgl: 800,
    positions: polygon([
      ["46°24'10\"N", "004°49'05\"E"], ["46°33'55\"N", "004°50'38\"E"],
      ["46°48'55\"N", "004°41'50\"E"], ["46°45'07\"N", "004°31'44\"E"],
      ["46°34'00\"N", "004°39'20\"E"], ["46°24'10\"N", "004°42'54\"E"]
    ])
  },
  {
    id: "LF R 45 S5",
    name: "MÂCONNAIS CENTRE",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "5000 ft AMSL",
    floorFeetAgl: 800,
    positions: polygon([
      ["46°24'10\"N", "004°49'05\"E"], ["46°33'55\"N", "004°50'38\"E"],
      ["46°31'33\"N", "004°52'02\"E"], ["46°33'26\"N", "005°20'24\"E"],
      ["46°33'41\"N", "005°21'16\"E"], ["46°24'32\"N", "005°27'35\"E"],
      ["46°23'07\"N", "005°20'14\"E"], ["46°24'10\"N", "005°02'45\"E"]
    ])
  },
  {
    id: "LF R 45 C",
    name: "ARBOIS",
    floor: "SFC (sol)",
    ceiling: "800 ft ASFC",
    floorFeetAgl: 0,
    positions: polygon([
      ["47°09'55\"N", "005°58'33\"E"], ["47°03'15\"N", "005°47'31\"E"],
      ["46°54'34\"N", "006°00'00\"E"], ["46°47'10\"N", "006°00'56\"E"],
      ["46°42'50\"N", "005°52'41\"E"], ["46°33'41\"N", "005°21'16\"E"],
      ["46°24'32\"N", "005°27'35\"E"], ["46°27'50\"N", "005°44'50\"E"],
      ["46°37'31\"N", "006°00'25\"E"], ["46°45'32\"N", "006°15'59\"E"],
      ["46°58'12\"N", "006°15'00\"E"]
    ])
  },
  {
    id: "LF R 45 S6.1",
    name: "MÂCONNAIS NORD-EST",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "FL 085",
    floorFeetAgl: 800,
    positions: polygon([
      ["47°09'55\"N", "005°58'33\"E"], ["47°03'15\"N", "005°47'31\"E"],
      ["46°54'34\"N", "006°00'00\"E"], ["46°47'10\"N", "006°00'56\"E"],
      ["46°42'50\"N", "005°52'41\"E"], ["46°37'31\"N", "006°00'25\"E"],
      ["46°45'32\"N", "006°15'59\"E"], ["46°58'12\"N", "006°15'00\"E"]
    ])
  },
  {
    id: "LF R 45 S6.2",
    name: "MÂCONNAIS SUD-EST",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "6700 ft AMSL",
    floorFeetAgl: 800,
    positions: polygon([
      ["46°42'50\"N", "005°52'41\"E"], ["46°33'41\"N", "005°21'16\"E"],
      ["46°24'32\"N", "005°27'35\"E"], ["46°27'50\"N", "005°44'50\"E"],
      ["46°37'31\"N", "006°00'25\"E"]
    ])
  },
  {
    id: "LF R 45 S7",
    name: "JURA",
    floor: "800 ft ASFC (~244 m)",
    ceiling: "FL 065",
    floorFeetAgl: 800,
    positions: polygon([
      ["47°09'55\"N", "005°58'33\"E"], ["47°03'15\"N", "005°47'31\"E"],
      ["47°14'23\"N", "005°32'45\"E"], ["47°19'09\"N", "005°36'42\"E"],
      ["47°37'55\"N", "006°16'36\"E"], ["47°33'46\"N", "006°31'48\"E"],
      ["47°14'14\"N", "005°52'58\"E"]
    ])
  }
];

function isPointOnSegment(point: [number, number], start: [number, number], end: [number, number]) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-9) return false;
  return point[0] >= Math.min(start[0], end[0]) - 1e-9 && point[0] <= Math.max(start[0], end[0]) + 1e-9 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-9 && point[1] <= Math.max(start[1], end[1]) + 1e-9;
}

export function pointInPolygon(point: [number, number], positions: [number, number][]) {
  let inside = false;
  for (let index = 0, previous = positions.length - 1; index < positions.length; previous = index++) {
    const currentPoint = positions[index];
    const previousPoint = positions[previous];
    if (isPointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects = (currentPoint[0] > point[0]) !== (previousPoint[0] > point[0]) &&
      point[1] < ((previousPoint[1] - currentPoint[1]) * (point[0] - currentPoint[0])) / (previousPoint[0] - currentPoint[0]) + currentPoint[1];
    if (intersects) inside = !inside;
  }
  return inside;
}

function localKilometers(origin: [number, number], point: [number, number]) {
  return {
    x: (point[1] - origin[1]) * 111.195 * Math.cos(origin[0] * Math.PI / 180),
    y: (point[0] - origin[0]) * 111.195
  };
}

function distanceToSegmentKm(point: [number, number], start: [number, number], end: [number, number]) {
  const a = localKilometers(point, start);
  const b = localKilometers(point, end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(a.x, a.y);
  const projection = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + projection * dx, a.y + projection * dy);
}

export function distanceToPolygonKm(point: [number, number], positions: [number, number][]) {
  if (pointInPolygon(point, positions)) return 0;
  let minimum = Infinity;
  for (let index = 0; index < positions.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegmentKm(point, positions[index], positions[(index + 1) % positions.length]));
  }
  return minimum;
}

export function assessRtba(point: [number, number], requestedHeightMeters: number): RtbaAssessment {
  const requestedHeightFeet = requestedHeightMeters / 0.3048;
  const matches = RTBA_ZONES.filter((zone) => pointInPolygon(point, zone.positions)).map((zone) => {
    const affectsRequestedHeight = requestedHeightFeet >= zone.floorFeetAgl;
    return { ...zone, affectsRequestedHeight, relation: affectsRequestedHeight ? "inside-volume" as const : "below-floor" as const };
  });
  const nearest = RTBA_ZONES.map((zone) => ({ zone, distanceKm: distanceToPolygonKm(point, zone.positions) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
  if (matches.some((zone) => zone.affectsRequestedHeight)) return { level: "inside-volume", matches, nearest };
  if (matches.length) return { level: "below-floor", matches, nearest };
  if ((nearest[0]?.distanceKm ?? Infinity) <= 120) return { level: "outside-local", matches, nearest };
  return { level: "coverage-unavailable", matches, nearest };
}

export function rtbaMapDisplayStatus(zoneId: string, assessment: RtbaAssessment | null): RtbaMapDisplayStatus {
  if (!assessment) return "unknown";
  const match = assessment.matches.find((zone) => zone.id === zoneId);
  if (match?.affectsRequestedHeight) return "intersects-height";
  if (match) return "below-floor";
  if (assessment.nearest.some(({ zone }) => zone.id === zoneId)) return "nearby";
  return "unknown";
}
