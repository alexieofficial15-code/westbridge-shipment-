import { env } from "../config/env.js";

/**
 * Sends email through Resend (free tier: 3,000 emails a month, 100 a day).
 * Until RESEND_API_KEY and MAIL_FROM are set, emails are skipped and logged,
 * so everything else works while the domain is being set up.
 * Returns whether the email was accepted for delivery.
 */
export async function sendMail(message: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.info(`[mail] not configured, skipped: "${message.subject}"`);
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error(`[mail] rejected (${response.status}): ${await response.text()}`);
    return response.ok;
  } catch (error) {
    console.error("[mail] failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const SERVICE_NAMES: Record<string, string> = {
  road: "Road freight",
  air: "Air freight",
  sea: "Sea freight",
  door_to_door: "Door-to-door delivery",
};

/** The booking email with the tracking number, shipment details and package photos, sent to the receiver. */
export function trackingNumberEmail(input: {
  name: string;
  role: "sender" | "receiver";
  trackingNumber: string;
  from: string;
  to: string;
  senderName: string;
  receiverName: string;
  service: string;
  pieces: number;
  weightKg: number;
  contents: string;
  estimatedDelivery: Date | null;
  /** Package photos, shown at the bottom of the email. */
  photoIds?: string[];
}): { subject: string; html: string; text: string } {
  const link = `${env.SITE_URL.replace(/\/$/, "")}/track/${input.trackingNumber}`;
  const intro =
    input.role === "sender"
      ? `Your shipment to ${input.receiverName} in ${input.to} has been booked.`
      : `${input.senderName} in ${input.from} has sent you a shipment.`;
  const eta = input.estimatedDelivery
    ? new Date(input.estimatedDelivery).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "To be confirmed";

  const rows: [string, string][] = [
    ["From", `${input.senderName}, ${input.from}`],
    ["To", `${input.receiverName}, ${input.to}`],
    ["Service", SERVICE_NAMES[input.service] ?? input.service],
    ["Package", `${input.pieces} ${input.pieces === 1 ? "piece" : "pieces"}, ${input.weightKg} kg`],
    ["Contents", input.contents],
    ["Estimated delivery", eta],
  ];

  const subject = `Your tracking number: ${input.trackingNumber}`;
  const text = [
    `Hello ${input.name},`,
    "",
    intro,
    "",
    `Tracking number: ${input.trackingNumber}`,
    `Track it any time: ${link}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "No account or password is needed. Keep this email so you can find the number later.",
  ].join("\n");

  // Plain and clean: logo, then text on white. No boxes, panels or coloured buttons.
  // The logo is loaded from the website, so it shows once the site is online at SITE_URL.
  const site = env.SITE_URL.replace(/\/$/, "");
  const detailLines = rows
    .map(([label, value]) => `<span style="color:#6b7280">${escapeHtml(label)}:</span> ${escapeHtml(value)}`)
    .join("<br>");

  // Photos are loaded from the website (like the logo), one under the other at full width so
  // they look right on phones and in every email app.
  const photoIds = input.photoIds ?? [];
  const photoUrl = (id: string) => `${site}/api/v1/track/${encodeURIComponent(input.trackingNumber)}/photos/${encodeURIComponent(id)}`;
  const photosHtml = photoIds.length
    ? `<p style="margin:32px 0 12px;color:#6b7280">Photos of your package</p>
    ${photoIds
      .map(
        (id, index) =>
          `<img src="${photoUrl(id)}" width="512" alt="Package photo ${index + 1}" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:8px;margin:0 0 12px">`,
      )
      .join("\n    ")}`
    : "";
  const photosText = photoIds.length
    ? ["", `Photos of your package (${photoIds.length}) are on your tracking page: ${link}`]
    : [];

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#182a48">
    <img src="${site}/brand/logo.png" width="150" alt="Westbridge International Logistics" style="display:block;width:150px;height:auto;border:0;margin:0 0 32px">
    <p style="margin:0 0 16px">Hello ${escapeHtml(input.name)},</p>
    <p style="margin:0 0 24px">${escapeHtml(intro)}</p>
    <p style="margin:0 0 4px;color:#6b7280">Your tracking number</p>
    <p style="margin:0 0 24px;font-size:24px;font-weight:bold;letter-spacing:2px">${escapeHtml(input.trackingNumber)}</p>
    <p style="margin:0 0 28px">Follow your shipment at any time: <a href="${link}" style="color:#eb5f1e;font-weight:bold">${escapeHtml(link.replace(/^https?:\/\//, ""))}</a></p>
    <p style="margin:0 0 28px">${detailLines}</p>
    <p style="margin:0 0 28px">No account or password is needed. Keep this email so you can find your tracking number later.</p>
    <p style="margin:0">Kind regards,<br>Westbridge International Logistics</p>
    ${photosHtml}
  </div>
</body></html>`;

  return { subject, html, text: [text, ...photosText].join("\n") };
}

/** One plain sentence per status, used as the email's subject line and headline. */
const STATUS_HEADLINES: Record<string, string> = {
  pending: "We've received your booking",
  picked_up: "Your shipment has been picked up",
  in_transit: "Your shipment is on its way",
  at_customs: "Your shipment is at customs",
  out_for_delivery: "Your shipment is out for delivery",
  ready_for_pickup: "Your shipment is ready to collect",
  delivered: "Your shipment has been delivered",
  exception: "There's an issue with your shipment",
};

/** The status-update email: same plain style as the booking email (logo, then text on white). */
export function statusUpdateEmail(input: {
  name: string;
  trackingNumber: string;
  status: string;
  description: string;
  location?: string;
  timestamp: Date;
}): { subject: string; html: string; text: string } {
  const site = env.SITE_URL.replace(/\/$/, "");
  const link = `${site}/track/${input.trackingNumber}`;
  const headline = STATUS_HEADLINES[input.status] ?? "Update on your shipment";
  const when = new Date(input.timestamp).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const subject = `${headline} (${input.trackingNumber})`;

  const text = [
    `Hello ${input.name},`,
    "",
    `${headline}.`,
    `${input.description}${input.location ? ` – ${input.location}` : ""}, ${when}.`,
    "",
    `Tracking number: ${input.trackingNumber}`,
    `Follow your shipment: ${link}`,
    "",
    "Kind regards,",
    "Westbridge International Logistics",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#182a48">
    <img src="${site}/brand/logo.png" width="150" alt="Westbridge International Logistics" style="display:block;width:150px;height:auto;border:0;margin:0 0 32px">
    <p style="margin:0 0 16px">Hello ${escapeHtml(input.name)},</p>
    <p style="margin:0 0 8px;font-size:20px;font-weight:bold">${escapeHtml(headline)}</p>
    <p style="margin:0 0 24px">${escapeHtml(input.description)}${input.location ? ` <span style="color:#6b7280">– ${escapeHtml(input.location)}</span>` : ""}<br><span style="color:#6b7280">${escapeHtml(when)}</span></p>
    <p style="margin:0 0 4px;color:#6b7280">Tracking number</p>
    <p style="margin:0 0 24px;font-weight:bold;letter-spacing:2px">${escapeHtml(input.trackingNumber)}</p>
    <p style="margin:0 0 28px">Follow your shipment at any time: <a href="${link}" style="color:#eb5f1e;font-weight:bold">${escapeHtml(link.replace(/^https?:\/\//, ""))}</a></p>
    <p style="margin:0">Kind regards,<br>Westbridge International Logistics</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
