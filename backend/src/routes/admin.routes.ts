import type { FastifyInstance } from "fastify";
import { clientRoutes } from "./clients.routes.js";
import { hubRoutes } from "./hubs.routes.js";
import { photoAndPositionRoutes } from "./photos-position.routes.js";
import { adminSettingsRoutes } from "./settings.routes.js";
import { shipmentRoutes } from "./shipments.routes.js";

/**
 * Everything the admin dashboard uses. Every route in here requires a valid admin
 * login token; the check runs before any of them.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  await app.register(clientRoutes);
  await app.register(hubRoutes);
  await app.register(shipmentRoutes);
  await app.register(photoAndPositionRoutes);
  await app.register(adminSettingsRoutes);
}
