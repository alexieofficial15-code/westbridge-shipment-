import { Shipment } from "../models/shipment.model.js";
import { emailStatusUpdate, forgetCachedShipment, type ShipmentRecord } from "./shipment-service.js";
import { dueSimulationEvents, simulationAt } from "./simulation-math.js";

/**
 * Running the delivery simulation. The vehicle's position is always worked out from the clock
 * (simulation-math.ts), so nothing needs saving while it drives. What does need saving is the
 * timeline: "Arrived at …", "Out for delivery", "Delivered". `advanceSimulation` posts any that
 * are due. It runs every minute (startSimulationTicker) and whenever someone opens the shipment,
 * so the timeline is right even if the server was asleep in between.
 */

// Steps that are worth an email to the customers; hub-by-hub arrivals would be too many.
const EMAILED_STEPS = new Set(["picked_up", "out_for_delivery", "delivered"]);

export async function advanceSimulation(trackingNumber: string, now = new Date()): Promise<boolean> {
  const shipment = (await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null;
  const sim = shipment?.simulation;
  if (!shipment || !sim?.active) return false;

  const due = dueSimulationEvents(shipment.route, sim, shipment.status, now);
  if (due.events.length === 0 && !due.finished) return false;

  const latest = due.events.at(-1);
  const set: Record<string, unknown> = {
    "simulation.appliedStop": due.appliedStop,
    "simulation.pickedUpApplied": due.pickedUpApplied,
    "simulation.outForDeliveryApplied": due.outForDeliveryApplied,
    "simulation.rev": sim.rev + 1,
  };
  if (latest) {
    set.status = latest.status;
    set.currentStop = latest.stopIndex;
  }
  if (due.finished) set["simulation.active"] = false;

  // Only succeeds if nobody else advanced it first (another server, or a parallel request).
  const updated = await Shipment.findOneAndUpdate(
    { _id: shipment._id, "simulation.active": true, "simulation.rev": sim.rev },
    { $set: set, ...(due.events.length ? { $push: { events: { $each: due.events } } } : {}) },
    { returnDocument: "after" },
  ).lean();
  if (!updated) return false;

  await forgetCachedShipment(trackingNumber);
  if (sim.notify) {
    for (const event of due.events) {
      if (EMAILED_STEPS.has(event.status)) await emailStatusUpdate(shipment, event);
    }
  }
  return true;
}

export type StartResult = { ok: true } | { ok: false; error: string };

/** Start (or restart) the simulation so the shipment arrives `durationMs` from now. */
export async function startSimulation(trackingNumber: string, durationMs: number, notify: boolean, now = new Date()): Promise<StartResult> {
  await stopSimulation(trackingNumber, now);
  const shipment = (await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null;
  if (!shipment) return { ok: false, error: "Shipment not found" };
  const lastStop = shipment.route.length - 1;
  if (shipment.status === "delivered" || shipment.currentStop >= lastStop) {
    return { ok: false, error: "This shipment has already arrived" };
  }

  // If the vehicle was left between stops (by hand, or a stopped simulation), carry on from there.
  const lastEvent = shipment.events.at(-1);
  const vehicle = shipment.vehicle;
  const startPoint =
    vehicle && (!lastEvent || new Date(vehicle.updatedAt) >= new Date(lastEvent.timestamp)) ? vehicle.location : null;

  const endsAt = new Date(now.getTime() + durationMs);
  await Shipment.updateOne(
    { _id: shipment._id },
    {
      $set: {
        simulation: {
          active: true,
          startedAt: now,
          endsAt,
          fromStop: shipment.currentStop,
          ...(startPoint ? { startPoint } : {}),
          appliedStop: shipment.currentStop,
          pickedUpApplied: shipment.status !== "pending",
          outForDeliveryApplied: shipment.status === "out_for_delivery",
          notify,
          rev: (shipment.simulation?.rev ?? 0) + 1,
        },
        estimatedDelivery: endsAt,
      },
      $unset: { vehicle: 1 },
    },
  );
  await advanceSimulation(trackingNumber, now);
  await forgetCachedShipment(trackingNumber);
  return { ok: true };
}

/**
 * Stop a running simulation (no-op if none is running). The vehicle stays where the simulation
 * had got to, and the line it drove is kept on the map.
 */
export async function stopSimulation(trackingNumber: string, now = new Date()): Promise<boolean> {
  await advanceSimulation(trackingNumber, now);
  const shipment = (await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null;
  const sim = shipment?.simulation;
  if (!shipment || !sim?.active) return false;

  const snapshot = simulationAt(shipment.route, sim, now);
  const set: Record<string, unknown> = { "simulation.active": false, "simulation.rev": sim.rev + 1 };
  if (snapshot.position) {
    set.vehicle = { location: snapshot.position, source: "estimate", updatedAt: now };
  }
  const trailPoints = snapshot.driven.map((point) => ({ ...point, source: "estimate", timestamp: now }));
  await Shipment.updateOne(
    { _id: shipment._id, "simulation.rev": sim.rev },
    { $set: set, ...(trailPoints.length ? { $push: { trail: { $each: trailPoints, $slice: -500 } } } : {}) },
  );
  await forgetCachedShipment(trackingNumber);
  return true;
}

/** Every minute, post whatever running simulations owe. Safe with several servers running it. */
export function startSimulationTicker(log: (message: string, error?: unknown) => void): () => void {
  const tick = async () => {
    try {
      const running = await Shipment.find({ "simulation.active": true }, { trackingNumber: 1 }).lean();
      for (const { trackingNumber } of running) await advanceSimulation(trackingNumber);
    } catch (error) {
      log("simulation tick failed", error);
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
