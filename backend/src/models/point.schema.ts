import { Schema } from "mongoose";

/** A map position. Used by clients (from their address), hubs and route stops. */
export const pointSchema = new Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);
