import type { ButtonHTMLAttributes, ReactNode } from "react";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/api";

// Small building blocks shared by the admin pages.

export const inputClass =
  "h-11 w-full rounded-xl border border-ink/15 bg-white px-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink/35 focus:border-orange focus:ring-2 focus:ring-orange/15 disabled:bg-ink/5";

export const selectClass = `${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23182a48' stroke-width='1.8'%3E%3Cpath d='m6 8 4 4 4-4'/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10`;

const BUTTON_VARIANTS = {
  primary: "bg-orange text-white shadow-sm shadow-orange/25 hover:bg-[#d9531a]",
  secondary: "border border-ink/15 bg-white text-navy hover:bg-ink/5",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-navy hover:bg-ink/5",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-navy">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-ink/8 bg-white p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-medium tracking-tight text-navy">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink/55">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ kind, children }: { kind: "success" | "error" | "info"; children: ReactNode }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-900",
    info: "border-navy/15 bg-navy/5 text-navy",
  };
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${styles[kind]}`}>
      {children}
    </p>
  );
}

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  pending: "bg-ink/8 text-ink/70",
  picked_up: "bg-sky-100 text-sky-800",
  in_transit: "bg-orange/12 text-[#b4440f]",
  at_customs: "bg-amber-100 text-amber-800",
  out_for_delivery: "bg-violet-100 text-violet-800",
  ready_for_pickup: "bg-violet-100 text-violet-800",
  delivered: "bg-emerald-100 text-emerald-800",
  exception: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-light tracking-tight text-navy sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-ink/60">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
