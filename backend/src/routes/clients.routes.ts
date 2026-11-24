import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { geocodeAddress } from "../lib/geocode.js";
import { replanWaitingShipments } from "../lib/shipment-service.js";
import { Client } from "../models/client.model.js";
import { Shipment } from "../models/shipment.model.js";
import { escapeRegex, firstIssue, latLng, objectId, optionalText, pagination, requiredText } from "./validation.js";

const addressSchema = z.object({
  street: requiredText(200),
  city: requiredText(100),
  country: requiredText(100),
  postalCode: optionalText(20),
});

const clientSchema = z.object({
  name: requiredText(120),
  email: z.email("Enter a valid email address").transform((value) => value.toLowerCase()),
  phone: requiredText(40).regex(/^[+\d][\d\s()-]{5,}$/, "Enter a valid phone number"),
  address: addressSchema,
  // Optional: set coordinates by hand when the address can't be found automatically.
  location: latLng.optional(),
});

type Address = { street: string; city: string; country: string; postalCode?: string | null };

/** Works out the client's map position from their address, unless one was given. */
async function locate(address: Address, manual?: z.infer<typeof latLng>) {
  if (manual) return { location: manual, geocodeStatus: "manual" as const };
  const found = await geocodeAddress(address);
  return found ? { location: found.point, geocodeStatus: "ok" as const } : { location: undefined, geocodeStatus: "failed" as const };
}

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  // List / search clients by name, email or phone.
  app.get("/api/v1/clients", async (request, reply) => {
    const parsed = pagination.extend({ q: optionalText(100) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    const { page, limit, q } = parsed.data;

    const filter = q
      ? { $or: ["name", "email", "phone"].map((field) => ({ [field]: { $regex: escapeRegex(q), $options: "i" } })) }
      : {};
    const [items, total] = await Promise.all([
      Client.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Client.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  });

  app.get("/api/v1/clients/:id", async (request, reply) => {
    const params = z.object({ id: objectId }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid id" });
    const client = await Client.findById(params.data.id).lean();
    if (!client) return reply.code(404).send({ error: "Client not found" });
    const shipments = await Shipment.countDocuments({ $or: [{ sender: client._id }, { receiver: client._id }] });
    return { ...client, shipments };
  });

  // Register a client. Their address is looked up on the map automatically.
  app.post("/api/v1/clients", async (request, reply) => {
    const parsed = clientSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    const { location, ...data } = parsed.data;
    const client = await Client.create({ ...data, ...(await locate(data.address, location)) });
    return reply.code(201).send(client.toObject());
  });

  app.patch("/api/v1/clients/:id", async (request, reply) => {
    const params = z.object({ id: objectId }).safeParse(request.params);
    const body = clientSchema.partial().safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Invalid id" });
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const { location, ...changes } = body.data;
    const update: Record<string, unknown> = { ...changes };
    // A new address (or new coordinates) means a new map position.
    if (changes.address || location) {
      const existing = await Client.findById(params.data.id).lean();
      if (!existing) return reply.code(404).send({ error: "Client not found" });
      const address = changes.address ?? (existing.address as Address | null | undefined);
      if (address) Object.assign(update, await locate(address, location));
    }

    const client = await Client.findByIdAndUpdate(params.data.id, update, { returnDocument: "after", runValidators: true }).lean();
    if (!client) return reply.code(404).send({ error: "Client not found" });
    // New address: the route of their shipments that haven't left yet is planned again from it.
    const routesUpdated = changes.address || location ? await replanWaitingShipments(client._id) : 0;
    return { ...client, routesUpdated };
  });

  // A client used on any shipment can't be deleted, so no shipment loses its sender or receiver.
  app.delete("/api/v1/clients/:id", async (request, reply) => {
    const params = z.object({ id: objectId }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid id" });
    const used = await Shipment.exists({ $or: [{ sender: params.data.id }, { receiver: params.data.id }] });
    if (used) return reply.code(409).send({ error: "This client has shipments and can't be deleted" });
    const deleted = await Client.findByIdAndDelete(params.data.id).lean();
    if (!deleted) return reply.code(404).send({ error: "Client not found" });
    return reply.code(204).send();
  });
}
