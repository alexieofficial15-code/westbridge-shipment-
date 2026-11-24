import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { geocode } from "../lib/geocode.js";
import { HUB_KINDS, Hub } from "../models/hub.model.js";
import { firstIssue, latLng, objectId, requiredText } from "./validation.js";

const hubSchema = z.object({
  name: requiredText(120),
  kind: z.enum(HUB_KINDS),
  city: requiredText(100),
  country: requiredText(100),
  // Optional: looked up from the name and city if left out.
  location: latLng.optional(),
  active: z.boolean().optional(),
});

export async function hubRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/hubs", async () => {
    const items = await Hub.find().sort({ country: 1, city: 1, name: 1 }).lean();
    return { items };
  });

  app.post("/api/v1/hubs", async (request, reply) => {
    const parsed = hubSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    const data = parsed.data;

    // Airports and ports are easier to find by name ("Douala International Airport"); offices by city.
    const location =
      data.location ??
      (await geocode(`${data.name}, ${data.city}, ${data.country}`)) ??
      (await geocode(`${data.city}, ${data.country}`));
    if (!location) {
      return reply.code(422).send({ error: "Couldn't find this place on the map. Enter its coordinates by hand." });
    }

    const hub = await Hub.create({ ...data, location });
    return reply.code(201).send(hub.toObject());
  });

  app.patch("/api/v1/hubs/:id", async (request, reply) => {
    const params = z.object({ id: objectId }).safeParse(request.params);
    const body = hubSchema.partial().safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid id" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const hub = await Hub.findByIdAndUpdate(params.data.id, body.data, { returnDocument: "after", runValidators: true }).lean();
    if (!hub) return reply.code(404).send({ error: "Hub not found" });
    return hub;
  });

  // Safe at any time: existing shipments keep a copy of each stop, so their routes don't change.
  app.delete("/api/v1/hubs/:id", async (request, reply) => {
    const params = z.object({ id: objectId }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid id" });
    const deleted = await Hub.findByIdAndDelete(params.data.id).lean();
    if (!deleted) return reply.code(404).send({ error: "Hub not found" });
    return reply.code(204).send();
  });
}
