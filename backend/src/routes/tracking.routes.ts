import type { FastifyInstance } from "fastify";
import { cacheGet, cacheSet } from "../cache/redis.js";
import { env } from "../config/env.js";
import { type ShipmentRecord, toPublicShipment, trackCacheKey } from "../lib/shipment-service.js";
import { advanceSimulation } from "../lib/simulation.js";
import { Photo } from "../models/photo.model.js";
import { Shipment } from "../models/shipment.model.js";
import { trackingNumberParam } from "./validation.js";

/** The public lookup behind the customer's shipment page. No login. */
export async function trackingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/track/:trackingNumber", async (request, reply) => {
    const parsed = trackingNumberParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid tracking number" });
    }

    const { trackingNumber } = parsed.data;
    const cacheKey = trackCacheKey(trackingNumber);

    // 1. Cache first: a hit never touches the database.
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      reply.header("x-cache", "HIT");
      return cached;
    }

    // 2. Miss: one indexed lookup, returned as a plain object (lean) for speed.
    let shipment = (await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null;
    if (!shipment) {
      return reply.code(404).send({ error: "Shipment not found" });
    }
    // A running simulation posts any steps that came due while nobody was looking (e.g. the server slept).
    if (shipment.simulation?.active && (await advanceSimulation(trackingNumber))) {
      shipment = ((await Shipment.findOne({ trackingNumber }).lean()) as unknown as ShipmentRecord | null) ?? shipment;
    }

    // 3. Only the safe, public fields leave the server. Store them so the next request, on any server, is a hit.
    const photos = await Photo.find({ shipment: shipment._id }, { _id: 1 }).sort({ createdAt: 1 }).lean();
    const publicView = toPublicShipment(
      shipment,
      photos.map((photo) => String(photo._id)),
    );
    await cacheSet(cacheKey, publicView, env.CACHE_TTL_SECONDS);
    reply.header("x-cache", "MISS");
    return publicView;
  });
}
