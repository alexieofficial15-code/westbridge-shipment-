import mongoose from "mongoose";
import { env } from "../config/env.js";

/**
 * The connection pooler.
 *
 * MongoDB has no separate pooler process: the driver keeps a pool of open
 * connections inside each backend server and reuses them across requests.
 * Each server opens at most MONGO_MAX_POOL_SIZE connections, so the total
 * hitting Atlas is (pool size x number of servers).
 */
export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    // Close connections that have been idle for a minute.
    maxIdleTimeMS: 60_000,
    // Fail fast instead of hanging when the pool is exhausted or Atlas is unreachable.
    waitQueueTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
  });
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
