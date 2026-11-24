import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service" };

// PLACEHOLDER: a starting outline, not legal advice. Have the final text reviewed
// before the site goes live.
const SECTIONS = [
  {
    heading: "Using this website",
    text: `This website lets you follow shipments handled by ${site.name}. By using it you agree to these terms.`,
  },
  {
    heading: "Tracking information",
    text: "We work to keep tracking information accurate and current. Statuses and delivery estimates are provided for information and can change as a shipment moves.",
  },
  {
    heading: "Your tracking number",
    text: "Anyone with a tracking number can view that shipment. Keeping your tracking number private is your responsibility.",
  },
  {
    heading: "Contact",
    text: `Questions about these terms? Write to us at ${site.email}.`,
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of service" sections={SECTIONS} />;
}
