// One place for the details that will change: brand name and contact details.
// Everything marked PLACEHOLDER must be replaced with the real value.

export const site = {
  name: "Westbridge International Logistics",
  shortName: "Westbridge",
  tagline: "Reliable deliveries with live tracking you can check any time, from any device.",

  // WhatsApp number, support email and phone are set by the admin in Dashboard -> Settings.
  // These are only the fallbacks used until that's done (or if the settings can't be loaded).
  whatsappNumber: "",
  email: "info@westbridgeinternationallogistics.com",
  phone: "",


  address: "Street address, City, Country", // PLACEHOLDER
  hours: "Monday to Saturday, 8:00 to 18:00", // PLACEHOLDER
};

export const NAV_LINKS = [
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#quote", label: "Get a quote" },
  { href: "/#faq", label: "FAQ" },
];

/**
 * Opens a WhatsApp chat, pre-filled with the tracking number when there is one.
 * Pass the number from useContactSettings(); it falls back to the default above.
 */
export function whatsappLink(trackingNumber?: string, number: string = site.whatsappNumber): string {
  const text = trackingNumber
    ? `Hello, I need help with shipment ${trackingNumber}.`
    : "Hello, I need help with my shipment.";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
