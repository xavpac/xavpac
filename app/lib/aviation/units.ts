export function feetToMeters(value: number) {
  return value * 0.3048;
}

export function feetPerMinuteToMetersPerSecond(value: number) {
  return value * 0.3048 / 60;
}

export function knotsToMetersPerSecond(value: number) {
  return value * 1852 / 3600;
}

export function metersPerSecondToFeetPerMinute(value: number) {
  return value * 60 / 0.3048;
}
