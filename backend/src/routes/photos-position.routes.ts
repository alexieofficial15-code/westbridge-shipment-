import type { FastifyInstance } from "fastify";
import { forgetCachedShipment, recordPosition } from "../lib/shipment-service.js";
import { stopSimulation } from "../lib/simulation.js";
import { MAX_PHOTOS_PER_SHIPMENT, PHOTO_TYPES, Photo } from "../models/photo.model.js";
import { Shipment } from "../models/shipment.model.js";
import { positionBody } from "./tracking-extras.routes.js";
import { firstIssue, objectId, trackingNumberParam } from "./validation.js";

/** Admin: package photos and the vehicle's position. */
export async function photoAndPositionRoutes(app: FastifyInstance): Promise<void> {
  // Set where the vehicle is, from the driver's report. Shows on the customer's map straight away.
  app.post("/api/v1/shipments/:trackingNumber/position", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    const body = positionBody.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const { note, ...point } = body.data;
    // A position entered by hand takes over from a running simulation.
    await stopSimulation(params.data.trackingNumber);
    const updated = await recordPosition(params.data.trackingNumber, point, "manual", note);
    if (!updated) return reply.code(404).send({ error: "Shipment not found" });
    return { vehicle: updated.vehicle, trail: updated.trail };
  });

  // Remove the vehicle marker (e.g. a wrong entry). The map then shows the current route stop.
  app.delete("/api/v1/shipments/:trackingNumber/position", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const clearTrail = (request.query as { trail?: string } | undefined)?.trail === "1";
    await stopSimulation(params.data.trackingNumber);
    const updated = await Shipment.findOneAndUpdate(
      { trackingNumber: params.data.trackingNumber },
      { $unset: { vehicle: 1 }, ...(clearTrail ? { $set: { trail: [] } } : {}) },
      { returnDocument: "after" },
    ).lean();
    if (!updated) return reply.code(404).send({ error: "Shipment not found" });
    await forgetCachedShipment(updated.trackingNumber);
    return { vehicle: null, trail: updated.trail };
  });

  app.get("/api/v1/shipments/:trackingNumber/photos", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const shipment = await Shipment.findOne({ trackingNumber: params.data.trackingNumber }, { _id: 1 }).lean();
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });
    const items = await Photo.find({ shipment: shipment._id }).select("-data").sort({ createdAt: 1 }).lean();
    return { items };
  });

  // Upload one photo (field name "photo"). JPEG, PNG or WebP, up to 5 MB, up to 10 per shipment.
  app.post("/api/v1/shipments/:trackingNumber/photos", async (request, reply) => {
    const params = trackingNumberParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    const shipment = await Shipment.findOne({ trackingNumber: params.data.trackingNumber }, { _id: 1, trackingNumber: 1 }).lean();
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });

    if ((await Photo.countDocuments({ shipment: shipment._id })) >= MAX_PHOTOS_PER_SHIPMENT) {
      return reply.code(400).send({ error: `A shipment can have at most ${MAX_PHOTOS_PER_SHIPMENT} photos` });
    }

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "No photo was sent" });
    const contentType = PHOTO_TYPES.find((type) => type === file.mimetype);
    if (!contentType) {
      return reply.code(400).send({ error: "Photos must be JPEG, PNG or WebP" });
    }

    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "That photo is too large (5 MB maximum)" });
    }

    const photo = await Photo.create({ shipment: shipment._id, contentType, data, size: data.length });
    await forgetCachedShipment(shipment.trackingNumber);
    return reply.code(201).send({ _id: photo._id, size: photo.size, createdAt: photo.createdAt });
  });

  app.delete("/api/v1/shipments/:trackingNumber/photos/:photoId", async (request, reply) => {
    const params = trackingNumberParam.extend({ photoId: objectId }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid photo" });
    const shipment = await Shipment.findOne({ trackingNumber: params.data.trackingNumber }, { _id: 1, trackingNumber: 1 }).lean();
    if (!shipment) return reply.code(404).send({ error: "Shipment not found" });
    const deleted = await Photo.findOneAndDelete({ _id: params.data.photoId, shipment: shipment._id }).lean();
    if (!deleted) return reply.code(404).send({ error: "Photo not found" });
    await forgetCachedShipment(shipment.trackingNumber);
    return reply.code(204).send();
  });
}
