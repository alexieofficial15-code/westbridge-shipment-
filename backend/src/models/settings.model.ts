import { Schema, model } from "mongoose";

/**
 * Site-wide settings the admin can change from the dashboard without touching the code.
 * There is only ever one document, with key "site".
 */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "site" },
    // Country code and number, digits only (e.g. "237600000000"). Used by every WhatsApp button.
    whatsappNumber: { type: String, trim: true, maxlength: 20, default: "" },
    supportEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: "" },
    supportPhone: { type: String, trim: true, maxlength: 40, default: "" },
  },
  { timestamps: true },
);

export const Settings = model("Settings", settingsSchema);

export type PublicSettings = { whatsappNumber: string; supportEmail: string; supportPhone: string };

export async function readSettings(): Promise<PublicSettings> {
  const doc = await Settings.findOne({ key: "site" }).lean();
  return {
    whatsappNumber: doc?.whatsappNumber ?? "",
    supportEmail: doc?.supportEmail ?? "",
    supportPhone: doc?.supportPhone ?? "",
  };
}
