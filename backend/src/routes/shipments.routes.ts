import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { defaultDescription, defaultStopFor } from "../lib/route-planner.js";
import {
  type ClientRecord,
  type ShipmentRecord,
  createShipment,
  emailStatusUpdate,
  emailTrackingNumber,
  forgetCachedShipment,
  routeBetween,
  simulationInfo,
  withSimulationView,
} from "../lib/shipment-service.js";
import { advanceSimulation, startSimulation, stopSimulation } from "../lib/simulation.js";
import { Client } from "../models/client.model.js";
import { Hub } from "../models/hub.model.js";
import { SERVICE_TYPES, SHIPMENT_STATUSES, Shipment, type ShipmentStatus } from "../models/shipment.model.js";
import {
  escapeRegex,
  firstIssue,
  objectId,
  optionalText,
  pagination,
  requiredText,
  trackingNumberParam,
} from "./validation.js";

const packageSchema = z.object({
  weightKg: z.coerce.number().positive("Weight must be more than 0").max(100_000),
  lengthCm: z.coerce.number().positive("Length must be more than 0").max(10_000),
  widthCm: z.coerce.number().positive("Width must be more than 0").max(10_000),
  heightCm: z.coerce.number().positive("Height must be more than 0").max(10_000),
  pieces: z.coerce.number().int().min(1).max(10_000),
  contents: requiredText(500),
});

const createSchema = z.object({
  senderId: objectId,
  receiverId: objectId,
  service: z.enum(SERVICE_TYPES),
  package: packageSchema,
  // Optional: worked out from the route and service if left out.
  estimatedDelivery: z.coerce.date().optional(),
  // false: don't email yet (the dashboard sends it after uploading the photos, so they're in it).
  sendEmail: z.boolean().optional(),
});

const updateSchema = z.object({
  package: packageSchema.partial().optional(),
  estimatedDelivery: z.coerce.date().nullable().optional(),
  // Changing the service re-plans the route (e.g. road -> air goes via the airports).
  service: z.enum(SERVICE_TYPES).optional(),
  // Message shown to the customer in place of the standard "What to do now"; null or "" removes it.
  notice: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
});

const routeSchema = z.object({
  // The hubs between the sender and the receiver, in order. The two ends stay as they are.
  hubIds: z.array(objectId).max(12),
});

/** Where the shipment sits on a new route, keeping its progress as far as possible. */
const clampStop = (status: string, current: number, routeLength: number) =>
  status === "delivered" ? routeLength - 1 : Math.min(current, Math.max(0, routeLength - 2));

const eventSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  // Optional: which route stop the shipment is at. Worked out from the status if left out.
  stopIndex: z.coerce.number().int().min(0).optional(),
  description: optionalText(300),
  // Email the update to the receiver.
  notify: z.boolean().optional(),
});

const populateParties = [
  { path: "sender", select: "name email phone address" },
  { path: "receiver", select: "name email phone address" },
];

/**
 * One shipment for the dashboard: catches up a running simulation first, then fills in the
 * simulated vehicle position and adds `simulationInfo` (progress, arrival time).
 */
async function detailView(trackingNumber: string) {
  await advanceSimulation(trackingNumber);
  const shipment = await Shipment.findOne({ trackingNumber }).populate(populateParties).lean();
  if (!shipment) return null;
  const record = shipment as unknown as ShipmentRecord;
  return { ...withSimulationView(record), simulationInfo: simulationInfo(record) };
}

/**
 * Posts a status update: moves the shipment to a stop on its route, adds it to the timeline,
 * and optionally emails the sender and receiver. A running simulation is stopped first, so
 * manual updates and the simulation never fight.
 */
async function postStatusUpdate(
  trackingNumber: string,
  input: { status: ShipmentStatus; stopIndex?: number; description?: string; notify?: boolean },
): Promise<{ shipment: unknown } | { error: string; code: number }> {
  await stopSimulation(trackingNumber);
  const shipment = (await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null;
  if (!shipment) return { error: "Shipment not found", code: 404 };

  const routeLength = shipment.route.length;
  const stopIndex = input.stopIndex ?? defaultStopFor(input.status, shipment.currentStop, routeLength);
  if (stopIndex >= routeLength) return { error: "That stop is not on this shipment's route", code: 400 };
  const stop = shipment.route[stopIndex]!;
  const event = {
    status: input.status,
    stopIndex,
    location: stop.label,
    description: input.description ?? defaultDescription(input.status, stop.label),
    timestamp: new Date(),
  };

  await Shipment.updateOne(
    { trackingNumber },
    { $set: { status: input.status, currentStop: stopIndex }, $push: { events: event } },
    { runValidators: true },
  );
  await forgetCachedShipment(trackingNumber);
  if (input.notify) await emailStatusUpdate(shipment, event);
  return { shipment: await detailView(trackingNumber) };
}

export async function shipmentRoutes(app: FastifyInstance): Promise<void> {
  // Counts for the dashboard's overview cards.
  app.get("/api/v1/stats", async () => {
    const [byStatus, total, clients] = await Promise.all([
      Shipment.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Shipment.estimatedDocumentCount(),
      Client.estimatedDocumentCount(),
    ]);
    const counts = Object.fromEntries(SHIPMENT_STATUSES.map((status) => [status, 0])) as Record<string, number>;
    for (const row of byStatus) counts[row._id] = row.count;
    return { total, clients, byStatus: counts };
  });

  // List shipments, newest first. Search by tracking number or by sender/receiver name.
  app.get("/api/v1/shipments", async (request, reply) => {
    const parsed = pagination
      .extend({ status: z.enum(SHIPMENT_STATUSES).optional(), q: optionalText(100) })
      .safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    const { page, limit, status, q } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (q) {
      const pattern = { $regex: escapeRegex(q.replace(/[\s-]/g, "")), $options: "i" };
      const matchingClients = await Client.find({ name: { $regex: escapeRegex(q), $options: "i" } }, { _id: 1 }).limit(200).lean();
      const ids = matchingClients.map((client) => client._id);
      filter.$or = [{ trackingNumber: pattern }, { sender: { $in: ids } }, { receiver: { $in: ids } }];
    }

    const [items, total] = await Promise.all([
      Shipment.find(filter)
        .select("trackingNumber status service sender receiver route currentStop estimatedDelivery createdAt updatedAt")
        .populate([
          { path: "sender", select: "name" },
          { path: "receiver", select: "name" },
        ])
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Shipment.countDocuments(filter),
    ]);

    return {
      items: items.map(({ route, ...item }) => ({
        ...item,
        origin: route[0]?.label ?? null,
        destination: route.at(-1)?.label ?? null,
        currentLocation: route[item.currentStop]?.label ?? null,
      })),
      total,
      page,
      limit,
    };
  });

  // One shipment with full sender and receiver details.
  app.get("/api/v1/shipments/:trackingNumber", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const view = await detailView(params.data.trackingNumber);
    if (!view) return reply.code(404).send({ error: "Shipment not found" });
    return view;
  });

  // Create a shipment: tracking number, route and delivery estimate are generated,
  // then the tracking number is emailed to the receiver.
  app.post("/api/v1/shipments", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    if (parsed.data.senderId === parsed.data.receiverId) {
      return reply.code(400).send({ error: "Sender and receiver must be different clients" });
    }

    const result = await createShipment(parsed.data);
    if ("error" in result) return reply.code(400).send({ error: result.error });
    return reply.code(201).send({ ...result.shipment, emailed: result.emailed });
  });

  // Edit package details, service, delivery estimate or the note to the customer.
  app.patch("/api/v1/shipments/:trackingNumber", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = updateSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    for (const [key, value] of Object.entries(body.data.package ?? {})) set[`package.${key}`] = value;
    if (body.data.estimatedDelivery !== undefined) set.estimatedDelivery = body.data.estimatedDelivery;
    if (body.data.notice === null) unset.notice = 1;
    else if (body.data.notice !== undefined) set.notice = body.data.notice;

    if (body.data.service) {
      const current = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
      if (!current) return reply.code(404).send({ error: "Shipment not found" });
      if (current.service !== body.data.service) {
        // A new route can't keep a simulation planned on the old one.
        await stopSimulation(params.data.trackingNumber);
        const [sender, receiver] = (await Promise.all([
          Client.findById(current.sender).lean(),
          Client.findById(current.receiver).lean(),
        ])) as unknown as [ClientRecord | null, ClientRecord | null];
        if (!sender || !receiver) return reply.code(400).send({ error: "Sender or receiver no longer exists" });
        const route = await routeBetween(sender, receiver, body.data.service);
        set.service = body.data.service;
        set.route = route;
        set.currentStop = clampStop(current.status, current.currentStop, route.length);
      }
    }

    const update = { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
    const shipment = await Shipment.findOneAndUpdate({ trackingNumber: params.data.trackingNumber }, update, {
      returnDocument: "after",
      runValidators: true,
    })
      .populate(populateParties)
      .lean();
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });
    await forgetCachedShipment(shipment.trackingNumber);
    return shipment;
  });

  // Post a status update. It moves the shipment along its route and appears on the customer's page.
  app.post("/api/v1/shipments/:trackingNumber/events", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = eventSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const result = await postStatusUpdate(params.data.trackingNumber, body.data);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.shipment;
  });

  // One click: move the shipment on to its next step. Next hub ("Arrived at …"); from the last hub,
  // "Out for delivery"; then "Delivered".
  app.post("/api/v1/shipments/:trackingNumber/next-stop", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = z.object({ notify: z.boolean().optional() }).safeParse(request.body ?? {});
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    await stopSimulation(params.data.trackingNumber);
    const shipment = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });

    const lastStop = shipment.route.length - 1;
    const lastHub = lastStop - 1;
    let step: { status: ShipmentStatus; stopIndex: number };
    if (shipment.status === "delivered" || shipment.currentStop >= lastStop) {
      return reply.code(400).send({ error: "This shipment has already been delivered" });
    } else if (shipment.status === "pending") {
      step = { status: "picked_up", stopIndex: shipment.currentStop };
    } else if (shipment.currentStop < lastHub) {
      step = { status: "in_transit", stopIndex: shipment.currentStop + 1 };
    } else if (shipment.status !== "out_for_delivery" && shipment.status !== "ready_for_pickup") {
      step = { status: "out_for_delivery", stopIndex: shipment.currentStop };
    } else {
      step = { status: "delivered", stopIndex: lastStop };
    }

    const result = await postStatusUpdate(params.data.trackingNumber, { ...step, notify: body.data.notify });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.shipment;
  });

  // Automatic simulation: arrive in the given time, moving along the route by itself.
  app.post("/api/v1/shipments/:trackingNumber/simulation", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = z
      .object({
        // From 5 minutes (handy for trying it out) up to 90 days.
        durationMinutes: z.coerce.number().min(5, "At least 5 minutes").max(90 * 24 * 60, "At most 90 days"),
        notify: z.boolean().default(false),
      })
      .safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const result = await startSimulation(params.data.trackingNumber, body.data.durationMinutes * 60_000, body.data.notify);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return detailView(params.data.trackingNumber);
  });

  app.delete("/api/v1/shipments/:trackingNumber/simulation", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    await stopSimulation(params.data.trackingNumber);
    const view = await detailView(params.data.trackingNumber);
    if (!view) return reply.code(404).send({ error: "Shipment not found" });
    return view;
  });

  // Re-plan the route with the current hubs (e.g. after adding a hub, or editing a client's address).
  app.post("/api/v1/shipments/:trackingNumber/replan", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    await stopSimulation(params.data.trackingNumber);
    const shipment = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });

    const [sender, receiver] = (await Promise.all([
      Client.findById(shipment.sender).lean(),
      Client.findById(shipment.receiver).lean(),
    ])) as unknown as [ClientRecord | null, ClientRecord | null];
    if (!sender || !receiver) return reply.code(400).send({ error: "Sender or receiver no longer exists" });

    const route = await routeBetween(sender, receiver, shipment.service);
    // Keep its progress: delivered stays at the end, anything else stays at the same position or the last hub.
    const currentStop = clampStop(shipment.status, shipment.currentStop, route.length);

    const updated = await Shipment.findOneAndUpdate({ _id: shipment._id }, { $set: { route, currentStop } }, { returnDocument: "after" })
      .populate(populateParties)
      .lean();
    await forgetCachedShipment(shipment.trackingNumber);
    return updated;
  });

  // Set the route's hubs by hand: the admin's chosen hubs, in order, between the two ends.
  app.put("/api/v1/shipments/:trackingNumber/route", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = routeSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });
    await stopSimulation(params.data.trackingNumber);
    const shipment = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });

    const found =(await Hub.find({ _id: { $in: body.data.hubIds } }).lean()) as unknown as {
      _id: { equals: (id: string) => boolean };
      name: string;
      location: { lat: number; lng: number };
    }[];
    const hubs = body.data.hubIds.map((id) => found.find((hub) => hub._id.equals(id)));
    if (hubs.some((hub) => !hub)) return reply.code(400).send({ error: "One of those hubs no longer exists" });

    const origin = shipment.route.find((stop) => stop.kind === "origin") ?? shipment.route[0]!;
    const destination = shipment.route.find((stop) => stop.kind === "destination") ?? shipment.route.at(-1)!;
    const route = [
      origin,
      ...hubs.map((hub) => ({ kind: "hub" as const, label: hub!.name, hub: hub!._id, location: hub!.location })),
      destination,
    ];
    const currentStop = clampStop(shipment.status, shipment.currentStop, route.length);

    const updated = await Shipment.findOneAndUpdate({ _id: shipment._id }, { $set: { route, currentStop } }, { returnDocument: "after", runValidators: true })
      .populate(populateParties)
      .lean();
    await forgetCachedShipment(shipment.trackingNumber);
    return updated;
  });

  // Remove a timeline entry posted by mistake. The shipment's status and position go back to
  // what the remaining latest entry says. The first entry ("registered") can't be removed.
  app.delete("/api/v1/shipments/:trackingNumber/events/:index", async (request, reply) => {
    const params = trackingNumberParam.extend({ index: z.coerce.number().int().min(0) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid request" });
    await stopSimulation(params.data.trackingNumber);
    const shipment = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });

    const { index } = params.data;
    if (index >= shipment.events.length) return reply.code(404).send({ error: "That update doesn't exist" });
    if (index === 0) return reply.code(400).send({ error: "The first update (registration) can't be removed" });

    const events = shipment.events.filter((_, position) => position !== index);
    const latest = events.at(-1)!;
    const lastStop = Math.max(0, shipment.route.length - 1);
    const updated = await Shipment.findOneAndUpdate(
      { _id: shipment._id },
      { $set: { events, status: latest.status, currentStop: Math.min(latest.stopIndex ?? 0, lastStop) } },
      { returnDocument: "after", runValidators: true },
    )
      .populate(populateParties)
      .lean();
    await forgetCachedShipment(shipment.trackingNumber);
    return updated;
  });

  // Send the tracking-number email again (e.g. the customer lost it).
  app.post("/api/v1/shipments/:trackingNumber/resend-email", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const shipment = (await Shipment.findOne({ trackingNumber: params.data.trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });
    const [sender, receiver] = (await Promise.all([
      Client.findById(shipment.sender).lean(),
      Client.findById(shipment.receiver).lean(),
    ])) as unknown as [ClientRecord | null, ClientRecord | null];
    if (!sender || !receiver) return reply.code(400).send({ error: "Sender or receiver no longer exists" });
    return { emailed: await emailTrackingNumber(shipment, sender, receiver), to: receiver.email };
  });

  app.delete("/api/v1/shipments/:trackingNumber", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const deleted = await Shipment.findOneAndDelete({ trackingNumber: params.data.trackingNumber }).lean();
    if (!deleted) return reply.code(404).send({ error: "Shipment not found" });
    await forgetCachedShipment(deleted.trackingNumber);
    return reply.code(204).send();
  });
}
