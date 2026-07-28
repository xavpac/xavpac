import test from "node:test";
import assert from "node:assert/strict";
import { classifyAircraftVisual } from "../../app/lib/aviation/aircraftVisual.ts";
import { photoLookupPaths } from "../../app/lib/aviation/providers/planespotters.ts";
import { airportHasCoordinates, routeCanUseAirportWeather, validCoordinate } from "../../app/lib/aviation/routeWeather.ts";
import type { AirportIdentity } from "../../app/lib/aviation/types.ts";

const departure: AirportIdentity = {
  name: "Lyon–Saint-Exupéry",
  municipality: "Lyon",
  iata: "LYS",
  icao: "LFLL",
  latitude: 45.7256,
  longitude: 5.0811
};

const arrival: AirportIdentity = {
  name: "Paris–Charles de Gaulle",
  municipality: "Paris",
  iata: "CDG",
  icao: "LFPG",
  latitude: 49.0097,
  longitude: 2.5479
};

test("cherche la photo exacte par Mode-S avant l’immatriculation", () => {
  assert.deepEqual(photoLookupPaths({ modeS: "~39AB12", registration: " f-gabc " }), [
    "hex/39ab12",
    "reg/F-GABC"
  ]);
});

test("n’active la météo que pour une route probable avec deux coordonnées fiables", () => {
  assert.equal(routeCanUseAirportWeather("probable", departure, arrival), true);
  assert.equal(routeCanUseAirportWeather("inferred", departure, arrival), false);
  assert.equal(routeCanUseAirportWeather("probable", { ...departure, latitude: null }, arrival), false);
  assert.equal(airportHasCoordinates({ ...arrival, longitude: 181 }), false);
  assert.equal(validCoordinate(Number.NaN, -90, 90), false);
});

test("fournit une illustration cohérente avec la famille de l’aéronef", () => {
  assert.equal(classifyAircraftVisual("H145", "helicopter").kind, "helicopter");
  assert.equal(classifyAircraftVisual("CL415", "Canadair").kind, "water-bomber");
  assert.equal(classifyAircraftVisual("A320").kind, "airliner");
});
