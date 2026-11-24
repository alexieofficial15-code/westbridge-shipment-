import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { redis } from "./cache/redis.js";
import { env } from "./config/env.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { MAX_PHOTO_BYTES } from "./models/photo.model.js";
import { publicSettingsRoutes } from "./routes/settings.routes.js";
import { trackingExtraRoutes } from "./routes/tracking-extras.routes.js";
import { trackingRoutes } from "./routes/tracking.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    // We sit behind the load balancer, so the real client IP is in X-Forwarded-For.
    trustProxy: true,
  });

  await app.register(helmet);

  // Limits are counted per visitor. With Redis the count is shared by all servers; without it, per server.
  // On Vercel every request reaches us through Vercel's servers, so the visitor's own address is
  // taken from the forwarding headers; otherwise every customer would share a single limit.
  // 300 a minute leaves room for the shipment page's 15-second auto-refresh plus photos and map.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const header = (name: string) => {
        const value = request.headers[name];
        return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
      };
      return header("x-vercel-forwarded-for") || header("x-real-ip") || request.ip;
    },
    ...(redis ? { redis } : {}),
  });

  // Lets you see which server behind the load balancer handled the request.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-served-by", env.INSTANCE_ID);
  });

  await app.register(jwt, { secret: env.JWT_SECRET });
  // Photo uploads: one file per request, at most 5 MB.
  await app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 5 } });

  await app.register(healthRoutes);
  await app.register(trackingRoutes);
  await app.register(trackingExtraRoutes);
  await app.register(publicSettingsRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);

  return app;
}
