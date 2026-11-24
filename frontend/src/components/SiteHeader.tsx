"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { LogoRow } from "@/components/Logo";
import { NAV_LINKS, site } from "@/lib/site";

const BOX = "glass-dark flex h-12 items-center rounded-full text-white";

/** Logo on the left, glass navigation on the right. Fixed on top of the page. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-8 sm:pt-6">
        <div className="flex items-center justify-between gap-3 *:pointer-events-auto">
          <Link href="/" onClick={close} aria-label={`${site.name} home`} className={`${BOX} px-4`}>
            <LogoRow />
          </Link>

          <div className="flex gap-2">
            <nav className={`${BOX} hidden gap-7 px-6 md:flex`} aria-label="Main">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm text-white/80 transition hover:text-orange">
                  {link.label}
                </Link>
              ))}
            </nav>
            <Link href="/#track" onClick={close} className={`${BOX} px-5 text-sm font-medium text-orange! transition hover:bg-white/15`}>
              Track
            </Link>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className={`${BOX} w-12 justify-center md:hidden`}
            >
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>

        {open && (
          <nav className="glass-dark pointer-events-auto mt-2 flex flex-col rounded-3xl p-2 text-white md:hidden" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-full px-4 py-3 text-white/90 transition hover:bg-white/10"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
