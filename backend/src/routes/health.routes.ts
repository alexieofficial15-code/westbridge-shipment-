import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { isMongoReady } from "../db/mongo.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: the process is up.
  app.get("/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
    instance: env.INSTANCE_ID,
    uptime: Math.round(process.uptime()),
  }));

  // Readiness: the process can actually serve traffic (database reachable).
  app.get("/ready", { config: { rateLimit: false } }, async (_request, reply) => {
    if (!isMongoReady()) {
      return reply.code(503).send({ status: "unavailable", instance: env.INSTANCE_ID });
    }
    return { status: "ready", instance: env.INSTANCE_ID };
  });
}
