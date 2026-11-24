import { Schema, model } from "mongoose";
import { pointSchema } from "./point.schema.js";

export const HUB_KINDS = ["office", "airport", "port"] as const;
export type HubKind = (typeof HUB_KINDS)[number];

/**
 * A point shipments pass through: one of the business's offices or warehouses,
 * or an airport / seaport it ships through. The route planner picks from these.
 */
const hubSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: HUB_KINDS, required: true },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    location: { type: pointSchema, required: true },
    // Inactive hubs stay on old shipments' routes but are not used for new ones.
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Hub = model("Hub", hubSchema);
