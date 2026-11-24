import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  INSTANCE_ID: z.string().default("backend-local"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  MONGO_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().default(2),
  REDIS_URL: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  // Signs admin login tokens. Must be identical on every backend server.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Public address of the website; used for the tracking link in emails.
  SITE_URL: z.string().url().default("http://localhost:3000"),
  // Address lookup service (OpenStreetMap Nominatim by default; free, no key).
  GEOCODER_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  // Email sending through Resend. Leave empty to skip emails until the domain is set up.
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  // Secret a GPS tracker sends with each position. Leave empty until a tracker is fitted
  // (the GPS endpoint stays switched off until then).
  GPS_DEVICE_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().min(24, "GPS_DEVICE_KEY must be at least 24 characters").optional()),
  // e.g. "Westbridge International Logistics <info@yourdomain.com>"
  MAIL_FROM: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
