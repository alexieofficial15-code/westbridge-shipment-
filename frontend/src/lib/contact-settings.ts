"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site";

/**
 * The contact details the admin sets in Dashboard -> Settings (WhatsApp number, support
 * email and phone). Loaded once per page and shared by every component that asks; until
 * it arrives, or if it can't be loaded, the defaults in site.ts are used.
 */

export type ContactSettings = { whatsappNumber: string; supportEmail: string; supportPhone: string };

const FALLBACK: ContactSettings = { whatsappNumber: site.whatsappNumber, supportEmail: site.email, supportPhone: site.phone };

let cached: ContactSettings | null = null;
let pending: Promise<ContactSettings> | null = null;

function load(): Promise<ContactSettings> {
  pending ??= fetch("/api/v1/settings")
    .then((response): Promise<Partial<ContactSettings>> | Partial<ContactSettings> =>
      response.ok ? (response.json() as Promise<Partial<ContactSettings>>) : {},
    )
    .then((data: Partial<ContactSettings>) => {
      // An empty value in the settings means "not set yet": keep the default for that one.
      cached = {
        whatsappNumber: data.whatsappNumber || FALLBACK.whatsappNumber,
        supportEmail: data.supportEmail || FALLBACK.supportEmail,
        supportPhone: data.supportPhone || FALLBACK.supportPhone,
      };
      return cached;
    })
    .catch(() => {
      pending = null; // try again on the next page that asks
      return FALLBACK;
    });
  return pending;
}

export function useContactSettings(): ContactSettings {
  const [settings, setSettings] = useState<ContactSettings>(cached ?? FALLBACK);
  useEffect(() => {
    let active = true;
    void load().then((value) => active && setSettings(value));
    return () => {
      active = false;
    };
  }, []);
  return settings;
}

/** Call after the admin saves new settings, so this tab shows them straight away. */
export function forgetContactSettings() {
  cached = null;
  pending = null;
}
