import { Schema, model } from "mongoose";
import { pointSchema } from "./point.schema.js";

/**
 * A customer, registered once by the admin and then picked as the sender or
 * receiver of any number of shipments. All contact fields are required.
 */
const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    address: {
      street: { type: String, required: true, trim: true, maxlength: 200 },
      city: { type: String, required: true, trim: true, maxlength: 100 },
      country: { type: String, required: true, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 20 },
    },
    // Filled in automatically from the address; used to plan the route on the map.
    location: { type: pointSchema },
    // "ok": found from the address. "failed": not found, the route falls back to city level.
    // "manual": the admin typed the coordinates in.
    geocodeStatus: { type: String, enum: ["ok", "failed", "manual"], default: "failed" },
  },
  { timestamps: true },
);

clientSchema.index({ name: 1 });

export const Client = model("Client", clientSchema);
