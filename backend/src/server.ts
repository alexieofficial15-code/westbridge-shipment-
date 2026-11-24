import { buildApp } from "./app.js";
import { redis } from "./cache/redis.js";
import { env } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { startSimulationTicker } from "./lib/simulation.js";

const app = await buildApp();

try {
  await connectMongo();
  app.log.info(`MongoDB connected (pool: ${env.MONGO_MIN_POOL_SIZE}-${env.MONGO_MAX_POOL_SIZE})`);
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error, "Failed to start");
  process.exit(1);
}

// Moves running delivery simulations along every minute, even when nobody has the site open.
const stopTicker = startSimulationTicker((message, error) => app.log.error(error, message));

// Graceful shutdown: finish in-flight requests before the process exits, so
// restarting one server behind the load balancer never drops a user request.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  stopTicker();
  try {
    await app.close();
    await disconnectMongo();
    await redis?.quit();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
