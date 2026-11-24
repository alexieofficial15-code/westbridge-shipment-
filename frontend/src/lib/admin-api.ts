import type { ServiceType, ShipmentStatus, TrackingEvent } from "@/lib/api";

// ---- Types returned by the admin API ----

export type Point = { lat: number; lng: number };

export type Address = { street: string; city: string; country: string; postalCode?: string };

export type Client = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  address: Address;
  location?: Point;
  geocodeStatus: "ok" | "failed" | "manual";
  createdAt: string;
  /** After an address edit: how many waiting shipments got a new route. */
  routesUpdated?: number;
};

export type ClientInput = { name: string; email: string; phone: string; address: Address; location?: Point };

export type HubKind = "office" | "airport" | "port";

export type Hub = {
  _id: string;
  name: string;
  kind: HubKind;
  city: string;
  country: string;
  location: Point;
  active: boolean;
};

export type HubInput = { name: string; kind: HubKind; city: string; country: string; location?: Point; active?: boolean };

export type PackageDetails = {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pieces: number;
  contents: string;
};

export type AdminRouteStop = { kind: "origin" | "hub" | "destination"; label: string; hub?: string; location?: Point };

export type AdminShipment = {
  _id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  service: ServiceType;
  sender: Client;
  receiver: Client;
  package: PackageDetails;
  route: AdminRouteStop[];
  currentStop: number;
  estimatedDelivery?: string | null;
  /** Message shown to the customer in place of the standard "What to do now". */
  notice?: string | null;
  events: (TrackingEvent & { stopIndex?: number })[];
  vehicle?: { location: Point; note?: string; source: "manual" | "gps" | "estimate"; updatedAt: string } | null;
  /** Set while the automatic delivery simulation is running. */
  simulationInfo?: { startedAt: string; endsAt: string; notify: boolean; progress: number; nextStop: string | null } | null;
  trail: (Point & { timestamp: string })[];
  createdAt: string;
  updatedAt: string;
};

export type ShipmentListItem = {
  _id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  service: ServiceType;
  sender: { _id: string; name: string } | null;
  receiver: { _id: string; name: string } | null;
  origin: string | null;
  destination: string | null;
  currentLocation: string | null;
  estimatedDelivery?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; limit: number };

export type Stats = { total: number; clients: number; byStatus: Record<ShipmentStatus, number> };

export type PhotoInfo = { _id: string; size: number; createdAt: string };

// ---- Session ----

const TOKEN_KEY = "admin-token";

/** The login lives in sessionStorage: it survives a refresh and is gone when the tab closes. */
export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the login still works until the page is closed
  }
}

/** Thrown when the login has expired; the dashboard then shows the sign-in form again. */
export class UnauthorizedError extends Error {}

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (response.status === 429) throw new Error("Too many attempts. Please wait a minute and try again.");
  // No JSON answer means the request never reached our server (wrong API_PROXY_TARGET, or it's down/asleep).
  if (!data) throw new Error(`Couldn't reach the server (error ${response.status}). Wait a minute and try again; if it keeps happening, the website's connection to the backend needs checking.`);
  if (!response.ok || !data.token) throw new Error(data.error ?? "Sign-in failed.");
  return data.token;
}

// ---- Requests ----

type RequestOptions = { method?: string; body?: unknown; form?: FormData };

export async function adminRequest<T>(token: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api/v1${path}`, { method: options.method ?? "GET", headers, body });
  if (response.status === 401) throw new UnauthorizedError("Your session has expired. Please sign in again.");
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};
