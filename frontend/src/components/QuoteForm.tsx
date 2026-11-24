"use client";

import { useState, type FormEvent } from "react";
import { GLASS_BUTTON } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useContactSettings } from "@/lib/contact-settings";
import { site } from "@/lib/site";

/**
 * Quote request. There is no inbox on the server yet, so the request is sent as
 * a pre-written WhatsApp message (or an email, as a fallback). When the backend
 * gets a /api/v1/quotes endpoint, point handleSubmit at it instead.
 */

const SERVICE_OPTIONS = ["Not sure yet", "Road freight", "Air freight", "Sea freight", "Door-to-door delivery"];

const FIELD =
  "glass h-12 w-full rounded-full px-5 text-white outline-none transition placeholder:text-white/60 focus:border-orange";

type FormValues = {
  name: string;
  phone: string;
  email: string;
  from: string;
  to: string;
  weight: string;
  service: string;
  notes: string;
};

const EMPTY: FormValues = { name: "", phone: "", email: "", from: "", to: "", weight: "", service: SERVICE_OPTIONS[0]!, notes: "" };

function buildMessage(values: FormValues): string {
  const lines: (string | null)[] = [
    `Hello ${site.shortName}, I would like a quote.`,
    "",
    `Name: ${values.name}`,
    `Phone: ${values.phone}`,
    values.email ? `Email: ${values.email}` : null,
    `From: ${values.from}`,
    `To: ${values.to}`,
    values.weight ? `Approx. weight: ${values.weight} kg` : null,
    `Service: ${values.service}`,
    values.notes ? `Details: ${values.notes}` : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function QuoteForm() {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [sent, setSent] = useState(false);
  // WhatsApp number and email from Dashboard -> Settings.
  const { whatsappNumber, supportEmail } = useContactSettings();

  const update = (key: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = encodeURIComponent(buildMessage(values));
    window.open(`https://wa.me/${whatsappNumber}?text=${text}`, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent("Quote request")}&body=${encodeURIComponent(buildMessage(values))}`;

  return (
    <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="sr-only">Your name</span>
          <input required value={values.name} onChange={update("name")} placeholder="Your name" autoComplete="name" className={FIELD} />
        </label>
        <label className="block">
          <span className="sr-only">Phone or WhatsApp number</span>
          <input required value={values.phone} onChange={update("phone")} placeholder="Phone / WhatsApp number" autoComplete="tel" inputMode="tel" className={FIELD} />
        </label>
        <label className="block sm:col-span-2">
          <span className="sr-only">Email (optional)</span>
          <input type="email" value={values.email} onChange={update("email")} placeholder="Email (optional)" autoComplete="email" className={FIELD} />
        </label>
        <label className="block">
          <span className="sr-only">Pick-up city or country</span>
          <input required value={values.from} onChange={update("from")} placeholder="From (city, country)" className={FIELD} />
        </label>
        <label className="block">
          <span className="sr-only">Delivery city or country</span>
          <input required value={values.to} onChange={update("to")} placeholder="To (city, country)" className={FIELD} />
        </label>
        <label className="block">
          <span className="sr-only">Approximate weight in kilograms</span>
          <input value={values.weight} onChange={update("weight")} placeholder="Approx. weight (kg)" inputMode="decimal" className={FIELD} />
        </label>
        <label className="block">
          <span className="sr-only">Service</span>
          <select value={values.service} onChange={update("service")} className={`${FIELD} appearance-none bg-transparent`}>
            {SERVICE_OPTIONS.map((option) => (
              <option key={option} value={option} className="text-ink">
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="sr-only">What are you sending?</span>
          <textarea
            value={values.notes}
            onChange={update("notes")}
            placeholder="What are you sending? Size, quantity, anything we should know."
            rows={3}
            className={`${FIELD} h-auto resize-none rounded-3xl py-3.5`}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="submit" className={`${GLASS_BUTTON} px-7`}>
          <Icon name="chat" className="size-5 text-whatsapp" />
          Send request on WhatsApp
        </button>
        <a href={mailto} className="text-sm text-white/75 underline-offset-4 transition hover:text-white hover:underline">
          Prefer email? Send it to {supportEmail}
        </a>
      </div>

      {sent && (
        <p role="status" className="mt-4 text-sm text-white/85">
          WhatsApp should have opened with your request ready to send. If it didn't, use the email link above.
        </p>
      )}
    </form>
  );
}
