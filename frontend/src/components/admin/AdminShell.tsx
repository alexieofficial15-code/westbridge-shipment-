"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, inputClass, Notice } from "@/components/admin/ui";
import { adminRequest, login, readToken, UnauthorizedError, writeToken } from "@/lib/admin-api";

type AdminContext = {
  /** Calls the admin API with the current login; signs out automatically if it has expired. */
  api: <T>(path: string, options?: Parameters<typeof adminRequest>[2]) => Promise<T>;
  signOut: () => void;
};

const Context = createContext<AdminContext | null>(null);

export function useAdmin(): AdminContext {
  const value = useContext(Context);
  if (!value) throw new Error("useAdmin must be used inside the admin dashboard");
  return value;
}

const NAV = [
  { href: "/admin", label: "Shipments", exact: true },
  { href: "/admin/shipments/new", label: "Book shipment" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/hubs", label: "Hubs" },
  { href: "/admin/settings", label: "Settings" },
];

/** Wraps every admin page: sign-in form when logged out, navigation bar when logged in. */
export function AdminShell({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setToken(readToken());
    setChecked(true);
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  const api = useCallback<AdminContext["api"]>(
    async (path, options) => {
      if (!token) throw new UnauthorizedError("Please sign in.");
      try {
        return await adminRequest(token, path, options);
      } catch (error) {
        if (error instanceof UnauthorizedError) signOut();
        throw error;
      }
    },
    [token, signOut],
  );

  const value = useMemo(() => ({ api, signOut }), [api, signOut]);

  if (!checked) return <div className="min-h-dvh bg-paper" />;
  if (!token) {
    return (
      <SignIn
        onSignedIn={(newToken) => {
          writeToken(newToken);
          setToken(newToken);
        }}
      />
    );
  }

  return (
    <Context.Provider value={value}>
      <div className="min-h-dvh bg-paper">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-8">
            <Link href="/admin" className="flex shrink-0 items-center gap-2.5" aria-label="Dashboard home">
              <Image src="/brand/mark-white.png" alt="" width={495} height={161} className="h-7 w-auto" />
              <span className="hidden text-sm font-medium text-white/80 sm:inline">Dashboard</span>
            </Link>
            <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Dashboard">
              {NAV.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition ${
                      active ? "bg-white/12 text-white" : "text-white/65 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex shrink-0 items-center gap-1">
              <Link href="/" className="hidden rounded-full px-3.5 py-2 text-sm text-white/65 transition hover:text-white md:inline">
                View site
              </Link>
              <button type="button" onClick={signOut} className="rounded-full px-3.5 py-2 text-sm text-white/65 transition hover:text-white">
                Sign out
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </Context.Provider>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await login(String(form.get("email") ?? "").trim(), String(form.get("password") ?? "")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo-white.png" alt="Westbridge International Logistics" width={495} height={304} className="mx-auto h-auto w-40" priority />
        <form onSubmit={handleSubmit} className="mt-10 space-y-4 rounded-3xl bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-light tracking-tight text-navy">Admin sign in</h1>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Email">
            <input name="email" type="email" required autoComplete="username" className={inputClass} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
