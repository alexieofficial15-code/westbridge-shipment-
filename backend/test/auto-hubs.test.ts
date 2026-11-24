import assert from "node:assert/strict";
import { test } from "node:test";
import { countryAt } from "../src/lib/auto-hubs.js";
import { planRoute } from "../src/lib/route-planner.js";

const london = { label: "London, United Kingdom", location: { lat: 51.5072, lng: -0.1276 } };
const douala = { label: "Douala, Cameroon", location: { lat: 4.0511, lng: 9.7679 } };
const yaounde = { label: "Yaounde, Cameroon", location: { lat: 3.848, lng: 11.5021 } };
const kigali = { label: "Kigali, Rwanda", location: { lat: -1.9441, lng: 30.0619 } };
const labels = (route: { label: string }[]) => route.map((stop) => stop.label);

test("countries are recognised from a position", () => {
  assert.equal(countryAt(london.location), "GB");
  assert.equal(countryAt(douala.location), "CM");
});

test("with no hubs added, air goes through each country's main airport", () => {
  assert.deepEqual(labels(planRoute(london, douala, "air", [])), [
    "London, United Kingdom",
    "London Sorting Hub",
    "London Heathrow Airport (LHR)",
    "Douala International Airport (DLA)",
    "Douala Sorting Hub",
    "Douala, Cameroon",
  ]);
});

test("with no hubs added, sea goes through the main seaports", () => {
  const route = labels(planRoute(london, douala, "sea", []));
  assert.equal(route[2], "Port of London");
  assert.equal(route[3], "Port of Douala");
});

test("a landlocked country ships through a neighbour's port", () => {
  const route = labels(planRoute(kigali, douala, "sea", []));
  assert.match(route[2]!, /^Port of /);
  assert.equal(route[3], "Port of Douala");
});

test("road goes city hub to city hub, and every stop has a map position", () => {
  const route = planRoute(douala, yaounde, "road", []);
  assert.deepEqual(labels(route), ["Douala, Cameroon", "Douala Sorting Hub", "Yaounde Sorting Hub", "Yaounde, Cameroon"]);
  assert.ok(route.every((stop) => stop.location));
});

test("an end without a map position gives just the two ends", () => {
  assert.equal(planRoute({ label: "Somewhere" }, douala, "air", []).length, 2);
});
