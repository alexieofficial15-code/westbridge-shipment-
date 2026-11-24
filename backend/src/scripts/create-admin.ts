// Creates an admin login, or resets its password if the email already exists.
// Run with: npm run create-admin -- you@example.com "a-strong-password"
import { redis } from "../cache/redis.js";
import { connectMongo, disconnectMongo } from "../db/mongo.js";
import { hashPassword } from "../lib/password.js";
import { Admin } from "../models/admin.model.js";

const [email, password] = process.argv.slice(2);

if (!email || !password || !email.includes("@") || password.length < 10) {
  console.error('Usage: npm run create-admin -- <email> "<password of at least 10 characters>"');
  process.exit(1);
}

await connectMongo();

await Admin.findOneAndUpdate(
  { email: email.toLowerCase() },
  { email: email.toLowerCase(), passwordHash: await hashPassword(password) },
  { upsert: true, runValidators: true },
);

console.log(`Admin ready: ${email.toLowerCase()}`);

await disconnectMongo();
await redis?.quit();
