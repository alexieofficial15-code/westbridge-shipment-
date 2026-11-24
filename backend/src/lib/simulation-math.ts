import type { ShipmentStatus } from "../models/shipment.model.js";
import { distanceKm, type LatLng } from "./geo.js";
import { defaultDescription } from "./route-planner.js";

/**
 * The pure maths of the delivery simulation: given the route, when the simulation started and
 * when it should arrive, where is the vehicle now, and which stops has it reached?
 * Nothing here reads or writes the database, so it can be called on every request.
 *
 * Time is shared out along the route in proportion to distance, so the vehicle moves at a
 * steady average speed. The route's straight lines between stops are followed.
 */

export type SimulationState = {
  active: boolean;
  startedAt: Date;
  endsAt: Date;
  fromStop: number;
  startPoint?: LatLng | null;
  appliedStop: number;
  pickedUpApplied: boolean;
  outForDeliveryApplied: boolean;
  notify: boolean;
  rev: number;
};

type Stop = { kind: "origin" | "hub" | "destination"; label: string; location?: LatLng | null };

type PathNode = { stop: number | null; location: LatLng | null; at: number; cum: number };

/** The points the vehicle travels through, with the time it reaches each. */
function plan(route: Stop[], sim: SimulationState): { nodes: PathNode[]; total: number } {
  const first: Omit<PathNode, "at" | "cum"> = sim.startPoint
    ? { stop: null, location: sim.startPoint }
    : { stop: sim.fromStop, location: route[sim.fromStop]?.location ?? null };
  const rest = route.slice(sim.fromStop + 1).map((stop, offset) => ({ stop: sim.fromStop + 1 + offset, location: stop.location ?? null }));
  const raw = [first, ...rest];

  // Real distances when every point is on the map; otherwise equal shares per leg.
  const allLocated = raw.every((node) => node.location);
  const legs = raw.slice(1).map((node, index) => (allLocated ? Math.max(distanceKm(raw[index]!.location!, node.location!), 0.01) : 1));
  const total = legs.reduce((sum, km) => sum + km, 0);

  const start = new Date(sim.startedAt).getTime();
  const span = Math.max(new Date(sim.endsAt).getTime() - start, 1);
  let cum = 0;
  const nodes = raw.map((node, index) => {
    if (index > 0) cum += legs[index - 1]!;
    return { ...node, cum, at: start + (total > 0 ? (cum / total) * span : span) };
  });
  return { nodes, total };
}

export type SimulationSnapshot = {
  /** Where the vehicle is now (null if the route isn't on the map). */
  position: LatLng | null;
  /** Points already driven, from the start to the current position. */
  driven: LatLng[];
  /** The next route stop it's heading for, or null once it has arrived. */
  nextStop: number | null;
  /** 0 to 1. */
  progress: number;
};

export function simulationAt(route: Stop[], sim: SimulationState, now: Date): SimulationSnapshot {
  const { nodes, total } = plan(route, sim);
  const start = new Date(sim.startedAt).getTime();
  const end = new Date(sim.endsAt).getTime();
  const progress = Math.min(1, Math.max(0, (now.getTime() - start) / Math.max(end - start, 1)));
  const covered = progress * total;

  let position: LatLng | null = null;
  const driven: LatLng[] = [];
  let nextStop: number | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.cum <= covered + 1e-9) {
      if (node.location) driven.push(node.location);
      position = node.location;
      continue;
    }
    nextStop = node.stop;
    const previous = nodes[i - 1];
    if (previous?.location && node.location) {
      const fraction = (covered - previous.cum) / Math.max(node.cum - previous.cum, 1e-9);
      position = {
        lat: previous.location.lat + (node.location.lat - previous.location.lat) * fraction,
        lng: previous.location.lng + (node.location.lng - previous.location.lng) * fraction,
      };
      driven.push(position);
    }
    break;
  }
  return { position, driven, nextStop, progress };
}

export type DueEvent = { status: ShipmentStatus; stopIndex: number; location: string; description: string; timestamp: Date };

/**
 * The timeline entries the simulation owes by `now` that haven't been posted yet, in order,
 * plus the bookkeeping to store so they're never posted twice.
 */
export function dueSimulationEvents(route: Stop[], sim: SimulationState, status: ShipmentStatus, now: Date) {
  const { nodes } = plan(route, sim);
  const lastStop = route.length - 1;
  const lastHub = lastStop - 1; // the stop it leaves for the final delivery run
  const start = new Date(sim.startedAt);
  const end = new Date(sim.endsAt).getTime();
  const events: DueEvent[] = [];
  const at = (stopIndex: number, statusValue: ShipmentStatus, timestamp: Date): DueEvent => ({
    status: statusValue,
    stopIndex,
    location: route[stopIndex]!.label,
    description: defaultDescription(statusValue, route[stopIndex]!.label),
    timestamp,
  });

  let pickedUpApplied = sim.pickedUpApplied;
  let outForDeliveryApplied = sim.outForDeliveryApplied;
  let appliedStop = sim.appliedStop;

  // Starting from the sender: it gets picked up as the simulation begins.
  if (!pickedUpApplied && status === "pending" && start <= now) {
    events.push(at(sim.fromStop, "picked_up", start));
    pickedUpApplied = true;
  }
  // Already at (or past) the last hub when it started: straight out for delivery.
  if (!outForDeliveryApplied && sim.fromStop >= lastHub && start <= now) {
    events.push(at(Math.max(sim.fromStop, 0), "out_for_delivery", new Date(start.getTime() + 1000)));
    outForDeliveryApplied = true;
  }

  for (const node of nodes) {
    if (node.stop === null || node.stop <= appliedStop || node.at > now.getTime()) continue;
    const reached = new Date(node.at);
    if (node.stop === lastStop) {
      // Make sure "out for delivery" comes first if it hasn't been posted yet.
      if (!outForDeliveryApplied) {
        const hubNode = nodes.find((candidate) => candidate.stop === lastHub);
        const leaving = Math.min((hubNode?.at ?? node.at) + 60_000, node.at - 1000);
        events.push(at(lastHub, "out_for_delivery", new Date(leaving)));
        outForDeliveryApplied = true;
      }
      events.push(at(lastStop, "delivered", reached));
    } else {
      events.push(at(node.stop, "in_transit", reached));
    }
    appliedStop = node.stop;
  }

  // Leaving the last hub: out for delivery a minute after arriving there (checked on every call,
  // so it's posted even if the arrival was recorded on an earlier call).
  if (!outForDeliveryApplied && appliedStop === lastHub && lastHub > sim.fromStop) {
    const hubNode = nodes.find((candidate) => candidate.stop === lastHub);
    if (hubNode) {
      const leaving = Math.max(hubNode.at, Math.min(hubNode.at + 60_000, end - 1000));
      if (leaving <= now.getTime()) {
        events.push(at(lastHub, "out_for_delivery", new Date(leaving)));
        outForDeliveryApplied = true;
      }
    }
  }

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return { events, appliedStop, pickedUpApplied, outForDeliveryApplied, finished: appliedStop >= lastStop };
}
