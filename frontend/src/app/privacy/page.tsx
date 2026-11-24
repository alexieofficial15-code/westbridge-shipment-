import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

// PLACEHOLDER: a starting outline, not legal advice. Have the final text reviewed
// before the site goes live.
const SECTIONS = [
  {
    heading: "What we collect",
    text: "To track a shipment you only enter a tracking number. You are not asked to create an account or give personal details on this website.",
  },
  {
    heading: "How shipment information is used",
    text: "Shipment details, such as status, locations and delivery estimate, are shown only to people who have the tracking number. Share your tracking number only with people who need it.",
  },
  {
    heading: "WhatsApp",
    text: "If you contact us on WhatsApp, your message and phone number are handled by WhatsApp under its own privacy policy. We use them only to answer your request.",
  },
  {
    heading: "Contact",
    text: `Questions about your privacy? Write to us at ${site.email}.`,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" sections={SECTIONS} />;
}
