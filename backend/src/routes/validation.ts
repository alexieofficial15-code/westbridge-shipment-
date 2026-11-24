import { z } from "zod";
import { normalizeTrackingNumber } from "../lib/tracking-number.js";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const trackingNumberParam = z.object({
  trackingNumber: z
    .string()
    .transform(normalizeTrackingNumber)
    .pipe(z.string().regex(/^[A-Z0-9]{6,40}$/, "Invalid tracking number")),
});

export const latLng = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const requiredText = (max: number) => z.string().trim().min(1, "This field is required").max(max);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/** Escapes text for use inside a MongoDB regex search. */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** First validation message, for a friendly 400 response. */
export const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
};
