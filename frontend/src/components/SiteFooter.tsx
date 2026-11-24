import Link from "next/link";
import { LogoStacked } from "@/components/Logo";
import { WhatsAppLink } from "@/components/WhatsAppButton";
import { NAV_LINKS, site } from "@/lib/site";

const COLUMNS = [
  { title: "Company", links: NAV_LINKS },
  {
    title: "Support",
    links: [
      { href: "/#track", label: "Track a shipment" },
      { href: "/#statuses", label: "What statuses mean" },
      { href: "/#packing", label: "Packing and prohibited items" },
      { href: "/#faq", label: "Help and FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
    ],
  },
];

// The Contact column (email, phone, address, hours) is removed until the real details are ready.
// To bring it back, add a fourth column here using <SupportContact kind="email" | "phone" />
// (from Dashboard -> Settings) and site.address / site.hours.

export function SiteFooter() {
  return (
    <footer id="contact" className="scroll-mt-24 bg-ink text-mist">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr] lg:gap-20">
          <div>
            <Link href="/" aria-label={`${site.name} home`} className="inline-block">
              <LogoStacked />
            </Link>
            <p className="mt-5 max-w-sm leading-relaxed">{site.tagline}</p>
            <div className="mt-7">
              <WhatsAppLink label="Chat on WhatsApp" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-sm font-medium text-orange">{column.title}</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="transition hover:text-orange">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-ink-line py-6 pb-24 text-sm sm:flex-row sm:items-center sm:justify-between sm:pb-6">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <div className="flex gap-6 sm:pr-40">
            <Link href="/privacy" className="transition hover:text-orange">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-orange">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
