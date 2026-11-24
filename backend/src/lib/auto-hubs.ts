import { AIRPORTS, CITIES, PORTS } from "../data/world-hubs.js";
import type { HubKind } from "../models/hub.model.js";
import { distanceKm, type LatLng } from "./geo.js";

/**
 * Picks the hubs a courier would normally use for any place in the world, from built-in data
 * (OurAirports and Natural Earth, both public domain): the main city's sorting hub, the main
 * international airport and the main seaport, preferring ones in the same country.
 */
export type AutoHub = { key: string; name: string; kind: HubKind; location: LatLng };

type Candidate<T> = { item: T; km: number };

function nearestOf<T>(items: T[], point: LatLng, at: (item: T) => LatLng): Candidate<T> | null {
  let best: Candidate<T> | null = null;
  for (const item of items) {
    const km = distanceKm(point, at(item));
    if (!best || km < best.km) best = { item, km };
  }
  return best;
}

const cityAt = (c: (typeof CITIES)[number]): LatLng => ({ lat: c[1], lng: c[2] });
const airportAt = (a: (typeof AIRPORTS)[number]): LatLng => ({ lat: a[2], lng: a[3] });
const portAt = (p: (typeof PORTS)[number]): LatLng => ({ lat: p[1], lng: p[2] });

/** The country (ISO code) a point is in, taken from the nearest known town. Good enough for picking hubs. */
export function countryAt(point: LatLng): string {
  return nearestOf(CITIES, point, cityAt)?.item[3] ?? "";
}

const cityHub = (c: (typeof CITIES)[number]): AutoHub => ({
  key: `city:${c[3]}:${c[0]}`,
  name: `${c[0]} Sorting Hub`,
  kind: "office",
  location: cityAt(c),
});

/** The sorting hub for a place: the nearest big city in the same country, or the nearest town if none is close. */
export function autoOffice(point: LatLng): AutoHub {
  const country = countryAt(point);
  const sameCountry = CITIES.filter((c) => c[3] === country);
  // Bigger cities first, but only if they're within a sensible drive.
  for (const [minPopulation, maxKm] of [
    [500_000, 200],
    [100_000, 120],
    [0, Number.POSITIVE_INFINITY],
  ] as const) {
    const found = nearestOf(
      sameCountry.filter((c) => c[4] >= minPopulation),
      point,
      cityAt,
    );
    if (found && found.km <= maxKm) return cityHub(found.item);
  }
  return cityHub(nearestOf(CITIES, point, cityAt)!.item);
}

/** The main international airport for a place: large airports in the same country first. */
export function autoAirport(point: LatLng): AutoHub {
  const country = countryAt(point);
  const sameCountry = AIRPORTS.filter((a) => a[4] === country);
  let pick: (typeof AIRPORTS)[number];
  if (sameCountry.length > 0) {
    const largeAirports = sameCountry.filter((a) => a[5] === 1);
    const large = nearestOf(largeAirports, point, airportAt);
    if (large && large.km <= 400) {
      // Where one city has several large airports (New York: JFK and LaGuardia), international
      // freight goes through the international one.
      const international = nearestOf(
        largeAirports.filter((a) => /international|intercontinental/i.test(a[0]) && distanceKm(point, airportAt(a)) <= large.km + 60),
        point,
        airportAt,
      );
      pick = (international ?? large).item;
    } else {
      pick = nearestOf(sameCountry, point, airportAt)!.item;
    }
  } else {
    pick = nearestOf(AIRPORTS, point, airportAt)!.item;
  }
  return { key: `air:${pick[1]}`, name: `${pick[0]} (${pick[1]})`, kind: "airport", location: airportAt(pick) };
}

/** The main seaport for a place: in the same country if it has one, else the nearest major port (for landlocked countries). */
export function autoPort(point: LatLng): AutoHub {
  const country = countryAt(point);
  const sameCountry = PORTS.filter((p) => p[3] === country);
  let pick: (typeof PORTS)[number];
  if (sameCountry.length > 0) {
    const major = nearestOf(
      sameCountry.filter((p) => p[4] <= 5),
      point,
      portAt,
    );
    pick = major && major.km <= 300 ? major.item : nearestOf(sameCountry, point, portAt)!.item;
  } else {
    pick = nearestOf(
      PORTS.filter((p) => p[4] <= 5),
      point,
      portAt,
    )!.item;
  }
  return { key: `port:${pick[3]}:${pick[0]}`, name: `Port of ${pick[0]}`, kind: "port", location: portAt(pick) };
}

/** Big cities (1 million+) whose sorting hubs lie roughly on the road between two points, nearest the start first. */
export function autoCitiesOnTheWay(a: LatLng, b: LatLng, corridorShare: number, max: number, avoid: LatLng[]): AutoHub[] {
  const direct = distanceKm(a, b);
  const picked: AutoHub[] = [];
  const candidates = CITIES.filter((c) => c[4] >= 1_000_000)
    .map((c) => ({ c, at: cityAt(c) }))
    .filter(({ at }) => distanceKm(a, at) + distanceKm(at, b) - direct <= direct * corridorShare)
    .filter(({ at }) => avoid.every((point) => distanceKm(point, at) > 60))
    .sort((x, y) => distanceKm(a, x.at) - distanceKm(a, y.at));
  for (const { c, at } of candidates) {
    if (picked.length >= max) break;
    // Spread them out: no two within 150 km of each other.
    if (picked.every((hub) => distanceKm(hub.location, at) > 150)) picked.push(cityHub(c));
  }
  return picked;
}
