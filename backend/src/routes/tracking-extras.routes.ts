import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { recordPosition } from "../lib/shipment-service.js";
import { stopSimulation } from "../lib/simulation.js";
import { Photo } from "../models/photo.model.js";
import { Shipment } from "../models/shipment.model.js";
import { firstIssue, latLng, objectId, optionalText, trackingNumberParam } from "./validation.js";

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Public routes that sit next to the tracking lookup: package photos, and the GPS feed. */
export async function trackingExtraRoutes(app: FastifyInstance): Promise<void> {
  // A package photo, for the customer's tracking page. Only served if it belongs to this tracking number.
  app.get("/api/v1/track/:trackingNumber/photos/:photoId", async (request, reply) => {
    const params = trackingNumberParam.extend({ photoId: objectId }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid photo" });

    const shipment = await Shipment.findOne({ trackingNumber: params.data.trackingNumber }, { _id: 1 }).lean();
    const photo = shipment ? await Photo.findOne({ _id: params.data.photoId, shipment: shipment._id }).lean() : null;
    if (!photo) return reply.code(404).send({ error: "Photo not found" });

    // A photo never changes once uploaded (it is deleted and re-added instead), so browsers can keep it.
    return reply
      .header("content-type", photo.contentType)
      .header("cache-control", "public, max-age=604800, immutable")
      // Shown inside the booking email too, so email apps (another site) must be allowed to load it.
      .header("cross-origin-resource-policy", "cross-origin")
      .send(Buffer.from(photo.data.buffer));
  });

  /**
   * For the GPS tracker, once one is fitted to the vehicle. Switched off until GPS_DEVICE_KEY
   * is set. The device sends its key in the "x-device-key" header with every position.
   */
  app.post("/api/v1/gps/:trackingNumber", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!env.GPS_DEVICE_KEY) return reply.code(404).send({ error: "Not found" });
    const key = request.headers["x-device-key"];
    if (typeof key !== "string" || !sameSecret(key, env.GPS_DEVICE_KEY)) return reply.code(401).send({ error: "Unauthorized" });

    const params = trackingNumberParam.safeParse(request.params);
    const body = latLng.extend({ note: optionalText(200) }).safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid tracking number" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const { note, ...point } = body.data;
    // Real GPS takes over from the simulation.
    await stopSimulation(params.data.trackingNumber);
    const updated = await recordPosition(params.data.trackingNumber, point, "gps", note);
    if (!updated) return reply.code(404).send({ error: "Shipment not found" });
    return { ok: true };
  });
}

export const positionBody = latLng.extend({ note: optionalText(200) });
