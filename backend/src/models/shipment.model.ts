import { Schema, model } from "mongoose";
import { pointSchema } from "./point.schema.js";

export const SHIPMENT_STATUSES = [
  "pending",
  "picked_up",
  "in_transit",
  "at_customs",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "exception",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SERVICE_TYPES = ["road", "air", "sea", "door_to_door"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/**
 * One stop on the shipment's route: where it starts, each hub it passes through,
 * and where it ends. The label and position are copied in when the route is planned,
 * so editing or removing a hub later never changes an existing shipment's history.
 */
const routeStopSchema = new Schema(
  {
    kind: { type: String, enum: ["origin", "hub", "destination"], required: true },
    label: { type: String, required: true, trim: true },
    hub: { type: Schema.Types.ObjectId, ref: "Hub" },
    location: { type: pointSchema },
  },
  { _id: false },
);

const trackingEventSchema = new Schema(
  {
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    location: { type: String, trim: true },
    description: { type: String, trim: true },
    timestamp: { type: Date, required: true },
    // Which route stop the shipment was at when this update was made.
    stopIndex: { type: Number, min: 0 },
  },
  { _id: false },
);

const packageSchema = new Schema(
  {
    weightKg: { type: Number, required: true, min: 0 },
    lengthCm: { type: Number, required: true, min: 0 },
    widthCm: { type: Number, required: true, min: 0 },
    heightCm: { type: Number, required: true, min: 0 },
    pieces: { type: Number, required: true, min: 1, default: 1 },
    contents: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

// manual: entered by the admin from the driver's report. gps: a tracker on the vehicle.
// estimate: worked out by the automatic simulation (see lib/simulation.ts).
export const POSITION_SOURCES = ["manual", "gps", "estimate"] as const;
export type PositionSource = (typeof POSITION_SOURCES)[number];

/**
 * Where the vehicle carrying the shipment is. For now the admin enters it by hand from
 * the driver's reports ("manual"); a GPS tracker will later send the same thing ("gps").
 */
const vehicleSchema = new Schema(
  {
    location: { type: pointSchema, required: true },
    note: { type: String, trim: true, maxlength: 200 },
    source: { type: String, enum: POSITION_SOURCES, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const trailPointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    source: { type: String, enum: POSITION_SOURCES, required: true },
  },
  { _id: false },
);

/**
 * Automatic delivery simulation, until GPS trackers are fitted. The admin picks how long the
 * delivery should take; the vehicle's position is then worked out from the clock, and hub
 * arrivals are posted as their time comes (see lib/simulation.ts).
 */
const simulationSchema = new Schema(
  {
    active: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    // The route stop it set off from, and (if it started between stops) the exact starting point.
    fromStop: { type: Number, required: true, min: 0 },
    startPoint: { type: pointSchema },
    // Progress already written to the timeline, so each step is posted exactly once.
    appliedStop: { type: Number, required: true, min: 0 },
    pickedUpApplied: { type: Boolean, default: false },
    outForDeliveryApplied: { type: Boolean, default: false },
    // Email the receiver at the key steps (picked up, out for delivery, delivered).
    notify: { type: Boolean, default: false },
    // Bumped on every write, so two servers can't post the same step twice.
    rev: { type: Number, default: 0 },
  },
  { _id: false },
);

/** Keep at most this many past positions per shipment (the line drawn behind the vehicle). */
export const MAX_TRAIL_POINTS = 500;

const shipmentSchema = new Schema(
  {
    // "unique" creates the index that makes tracking lookups fast.
    trackingNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    sender: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    service: { type: String, enum: SERVICE_TYPES, required: true },
    package: { type: packageSchema, required: true },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "pending" },
    route: { type: [routeStopSchema], default: [] },
    // Index into `route` of where the shipment is now. Drives the map.
    currentStop: { type: Number, default: 0, min: 0 },
    estimatedDelivery: { type: Date },
    events: { type: [trackingEventSchema], default: [] },
    // Optional message from the admin, shown to the customer in place of the standard
    // "What to do now" text (e.g. "Bring your ID when collecting").
    notice: { type: String, trim: true, maxlength: 300 },
    vehicle: { type: vehicleSchema },
    trail: { type: [trailPointSchema], default: [] },
    simulation: { type: simulationSchema },
  },
  { timestamps: true },
);

// The dashboard lists newest first and filters by status.
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ status: 1, updatedAt: -1 });
// The simulation ticker looks up running simulations every minute.
shipmentSchema.index({ "simulation.active": 1 }, { partialFilterExpression: { "simulation.active": true } });

export const Shipment = model("Shipment", shipmentSchema);
