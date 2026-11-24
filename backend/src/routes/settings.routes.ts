import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Settings, readSettings } from "../models/settings.model.js";
import { firstIssue } from "./validation.js";

const settingsSchema = z.object({
  // Digits only; spaces, dashes, brackets and a leading "+" are stripped first.
  whatsappNumber: z
    .string()
    .transform((value) => value.replace(/[\s\-()+]/g, ""))
    .pipe(z.string().regex(/^(\d{7,15})?$/, "Enter the WhatsApp number with its country code, digits only")),
  supportEmail: z.union([z.literal(""), z.email("Enter a valid email address")]),
  supportPhone: z.string().trim().max(40),
});

/** Public: the contact details the website shows (WhatsApp buttons, help links). */
export async function publicSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/settings", async (_request, reply) => {
    // Browsers and the website may keep it for a minute; changes show up quickly enough.
    reply.header("cache-control", "public, max-age=60");
    return readSettings();
  });
}

/** Admin: change those contact details. */
export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.put("/api/v1/settings", async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: firstIssue(parsed.error) });
    await Settings.findOneAndUpdate({ key: "site" }, { ...parsed.data, key: "site" }, { upsert: true, runValidators: true });
    return readSettings();
  });
}
