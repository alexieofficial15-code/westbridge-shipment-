"use client";

import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useContactSettings } from "@/lib/contact-settings";
import { whatsappLink } from "@/lib/site";

// The WhatsApp number comes from Dashboard -> Settings (see contact-settings.ts).

/** Floating "contact me on WhatsApp" button, fixed to the bottom-right corner. */
export function WhatsAppFloat({ trackingNumber }: { trackingNumber?: string }) {
  const { whatsappNumber } = useContactSettings();
  return (
    <a
      href={whatsappLink(trackingNumber, whatsappNumber)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact us on WhatsApp"
      className="glass-dark fixed bottom-4 right-4 z-50 flex h-12 items-center gap-2.5 rounded-full px-3.5 text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:-translate-y-0.5 active:scale-95 sm:bottom-6 sm:right-6 sm:px-5"
    >
      <Icon name="chat" className="size-5 text-whatsapp" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}

/**
 * Inline WhatsApp button. Glass on photo and dark backgrounds; pass `onLight`
 * when it sits on a white or pale background.
 */
export function WhatsAppLink({
  trackingNumber,
  label,
  onLight = false,
}: {
  trackingNumber?: string;
  label: string;
  onLight?: boolean;
}) {
  const { whatsappNumber } = useContactSettings();
  return (
    <ButtonLink href={whatsappLink(trackingNumber, whatsappNumber)} variant={onLight ? "glass-light" : "glass"} external>
      <Icon name="chat" className={`size-5 ${onLight ? "" : "text-whatsapp"}`} />
      {label}
    </ButtonLink>
  );
}

/** A plain WhatsApp link (any styling), for places like the shipment page's top bar. */
export function WhatsAppAnchor({
  trackingNumber,
  className,
  children,
}: {
  trackingNumber?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { whatsappNumber } = useContactSettings();
  return (
    <a href={whatsappLink(trackingNumber, whatsappNumber)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/** The support email and phone from the settings, as links (used in the footer). */
export function SupportContact({ kind, className }: { kind: "email" | "phone"; className?: string }) {
  const { supportEmail, supportPhone } = useContactSettings();
  return kind === "email" ? (
    <a href={`mailto:${supportEmail}`} className={className}>
      {supportEmail}
    </a>
  ) : (
    <a href={`tel:${supportPhone.replace(/\s/g, "")}`} className={className}>
      {supportPhone}
    </a>
  );
}
