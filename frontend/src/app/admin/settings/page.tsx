"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Button, Card, Field, Notice, PageHeader, inputClass } from "@/components/admin/ui";
import { forgetContactSettings, type ContactSettings } from "@/lib/contact-settings";

/** Contact details used across the website: every WhatsApp button, the footer, the quote form. */
export default function SettingsPage() {
  const { api } = useAdmin();
  const [settings, setSettings] = useState<ContactSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings", { cache: "no-store" })
      .then((response) => response.json() as Promise<ContactSettings>)
      .then(setSettings, () => setNotice({ kind: "error", text: "Couldn't load the settings." }));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api<ContactSettings>("/settings", {
        method: "PUT",
        body: { whatsappNumber: value("whatsappNumber"), supportEmail: value("supportEmail"), supportPhone: value("supportPhone") },
      });
      setSettings(saved);
      forgetContactSettings();
      setNotice({ kind: "success", text: "Saved. Visitors see the new details within about a minute." });
    } catch (caught) {
      setNotice({ kind: "error", text: caught instanceof Error ? caught.message : "Couldn't save the settings." });
    } finally {
      setBusy(false);
    }
  }

  const testLink = settings?.whatsappNumber ? `https://wa.me/${settings.whatsappNumber}` : null;

  return (
    <>
      <PageHeader title="Settings" subtitle="Contact details shown to customers across the website." />
      {notice && (
        <div className="mb-6">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}
      <Card title="Contact details" description="Used by every WhatsApp button, the Help button on shipment pages, the footer and the quote form." className="max-w-2xl">
        {!settings ? (
          <div className="h-48 animate-pulse rounded-2xl bg-ink/5" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="WhatsApp number"
              hint={
                <>
                  With the country code, e.g. +237 6XX XXX XXX. While it&apos;s empty, WhatsApp buttons open WhatsApp without a recipient.
                  {testLink && (
                    <>
                      {" "}
                      <a href={testLink} target="_blank" rel="noopener noreferrer" className="font-medium text-orange hover:underline">
                        Test it
                      </a>
                    </>
                  )}
                </>
              }
            >
              <input name="whatsappNumber" type="tel" defaultValue={settings.whatsappNumber ? `+${settings.whatsappNumber}` : ""} className={inputClass} />
            </Field>
            <Field label="Support email" hint="Shown in the footer and used by the quote form's email option.">
              <input name="supportEmail" type="email" defaultValue={settings.supportEmail} className={inputClass} />
            </Field>
            <Field label="Support phone" hint="Shown in the footer.">
              <input name="supportPhone" type="tel" defaultValue={settings.supportPhone} className={inputClass} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
