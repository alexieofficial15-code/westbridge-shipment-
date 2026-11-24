import { Schema, model } from "mongoose";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_SHIPMENT = 10;

/**
 * A picture of a shipment's package, shown on the customer's tracking page.
 * Stored in the database itself (photos are shrunk in the browser before upload,
 * to about 300 KB), so there is no separate file storage service to pay for or set up.
 */
const photoSchema = new Schema(
  {
    shipment: { type: Schema.Types.ObjectId, ref: "Shipment", required: true, index: true },
    contentType: { type: String, enum: PHOTO_TYPES, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);

export const Photo = model("Photo", photoSchema);
