// End-to-end test of the API against a temporary in-memory MongoDB (no Atlas needed).
// Run with: npm test
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri("tracking-test");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.REDIS_URL = "";
// Point address lookups at a closed local port, so the test never sends anything over the internet.
process.env.GEOCODER_URL = "http://127.0.0.1:9";
process.env.RESEND_API_KEY = "";

const { buildApp } = await import("../src/app.js");
const { connectMongo, disconnectMongo } = await import("../src/db/mongo.js");
const { Admin } = await import("../src/models/admin.model.js");
const { hashPassword } = await import("../src/lib/password.js");

const app = await buildApp();
let token = "";
const auth = () => ({ authorization: `Bearer ${token}` });

before(async () => {
  await connectMongo();
  await Admin.create({ email: "admin@example.com", passwordHash: await hashPassword("correct-horse") });
  await app.ready();
});

after(async () => {
  await app.close();
  await disconnectMongo();
  await mongo.stop();
});

test("admin routes reject requests without a login", async () => {
  const res = await app.inject({ method: "GET", url: "/api/v1/shipments" });
  assert.equal(res.statusCode, 401);
});

test("login with the wrong password fails, the right one returns a token", async () => {
  const bad = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "admin@example.com", password: "nope" } });
  assert.equal(bad.statusCode, 401);
  const good = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "admin@example.com", password: "correct-horse" } });
  assert.equal(good.statusCode, 200);
  token = good.json().token;
  assert.ok(token);
});

const ids: Record<string, string> = {};

test("hubs can be added with coordinates", async () => {
  const hubs = [
    { name: "Douala Hub", kind: "office", city: "Douala", country: "Cameroon", location: { lat: 4.0511, lng: 9.7679 } },
    { name: "Edea Depot", kind: "office", city: "Edea", country: "Cameroon", location: { lat: 3.8, lng: 10.1333 } },
    { name: "Yaounde Hub", kind: "office", city: "Yaounde", country: "Cameroon", location: { lat: 3.848, lng: 11.5021 } },
    { name: "Bamenda Hub", kind: "office", city: "Bamenda", country: "Cameroon", location: { lat: 5.9631, lng: 10.1591 } },
    { name: "Douala Airport", kind: "airport", city: "Douala", country: "Cameroon", location: { lat: 4.0061, lng: 9.7195 } },
    { name: "Paris CDG", kind: "airport", city: "Paris", country: "France", location: { lat: 49.0097, lng: 2.5479 } },
    { name: "Paris Office", kind: "office", city: "Paris", country: "France", location: { lat: 48.8566, lng: 2.3522 } },
  ];
  for (const hub of hubs) {
    const res = await app.inject({ method: "POST", url: "/api/v1/hubs", headers: auth(), payload: hub });
    assert.equal(res.statusCode, 201, res.body);
  }
  const list = await app.inject({ method: "GET", url: "/api/v1/hubs", headers: auth() });
  assert.equal(list.json().items.length, hubs.length);
});

test("a hub that can't be found on the map and has no coordinates is refused", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/hubs",
    headers: auth(),
    payload: { name: "Nowhere", kind: "office", city: "Nowhere", country: "Nowhere" },
  });
  assert.equal(res.statusCode, 422);
});

test("clients need name, email, phone and full address", async () => {
  const missing = await app.inject({
    method: "POST",
    url: "/api/v1/clients",
    headers: auth(),
    payload: { name: "No Phone", email: "a@example.com", address: { street: "x", city: "y", country: "z" } },
  });
  assert.equal(missing.statusCode, 400);

  const clients = {
    douala: { name: "Ada Sender", email: "ada@example.com", phone: "+237 600 000 001", address: { street: "1 Rue A", city: "Douala", country: "Cameroon" }, location: { lat: 4.06, lng: 9.71 } },
    yaounde: { name: "Ben Receiver", email: "ben@example.com", phone: "+237 600 000 002", address: { street: "2 Rue B", city: "Yaounde", country: "Cameroon" }, location: { lat: 3.87, lng: 11.52 } },
    paris: { name: "Cleo Paris", email: "cleo@example.com", phone: "+33 6 00 00 00 03", address: { street: "3 Rue C", city: "Paris", country: "France" }, location: { lat: 48.86, lng: 2.35 } },
  };
  for (const [key, client] of Object.entries(clients)) {
    const res = await app.inject({ method: "POST", url: "/api/v1/clients", headers: auth(), payload: client });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().geocodeStatus, "manual");
    ids[key] = res.json()._id;
  }

  const search = await app.inject({ method: "GET", url: "/api/v1/clients?q=ben", headers: auth() });
  assert.equal(search.json().total, 1);
});

const pkg = { weightKg: 4.2, lengthCm: 40, widthCm: 30, heightCm: 20, pieces: 1, contents: "Clothes" };
let roadTracking = "";

test("a road shipment gets a tracking number, an estimate and a route through the hubs on the way", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/shipments",
    headers: auth(),
    payload: { senderId: ids.douala, receiverId: ids.yaounde, service: "road", package: pkg },
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json();
  roadTracking = body.trackingNumber;

  assert.match(roadTracking, /^WB[A-HJKMNP-Z2-9]{10}$/);
  assert.ok(new Date(body.estimatedDelivery) > new Date());
  // Email isn't configured in the test, so it is skipped, not failed.
  assert.equal(body.emailed, false);

  const labels = body.route.map((stop: { label: string }) => stop.label);
  // Edea lies on the road between Douala and Yaounde; Bamenda does not.
  assert.deepEqual(labels, ["Douala, Cameroon", "Douala Hub", "Edea Depot", "Yaounde Hub", "Yaounde, Cameroon"]);
});

test("an air shipment routes through the airports at both ends", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/shipments",
    headers: auth(),
    payload: { senderId: ids.douala, receiverId: ids.paris, service: "air", package: pkg },
  });
  assert.equal(res.statusCode, 201, res.body);
  airTracking = res.json().trackingNumber;
  const labels = res.json().route.map((stop: { label: string }) => stop.label);
  assert.deepEqual(labels, ["Douala, Cameroon", "Douala Hub", "Douala Airport", "Paris CDG", "Paris Office", "Paris, France"]);
});

let airTracking = "";

test("sender and receiver must be different", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/shipments",
    headers: auth(),
    payload: { senderId: ids.douala, receiverId: ids.douala, service: "road", package: pkg },
  });
  assert.equal(res.statusCode, 400);
});

test("status updates move the shipment along its route", async () => {
  const post = (status: string, extra: Record<string, unknown> = {}) =>
    app.inject({ method: "POST", url: `/api/v1/shipments/${roadTracking}/events`, headers: auth(), payload: { status, ...extra } });

  let res = await post("picked_up");
  assert.equal(res.json().currentStop, 0);
  res = await post("in_transit"); // -> Douala Hub
  assert.equal(res.json().currentStop, 1);
  res = await post("in_transit"); // -> Edea Depot
  assert.equal(res.json().currentStop, 2);
  assert.equal(res.json().events.at(-1).description, "Arrived at Edea Depot");
  res = await post("at_customs"); // stays put
  assert.equal(res.json().currentStop, 2);
  res = await post("out_for_delivery"); // -> last hub
  assert.equal(res.json().currentStop, 3);
  res = await post("delivered"); // -> receiver
  assert.equal(res.json().currentStop, 4);
  assert.equal(res.json().status, "delivered");

  const offRoute = await post("in_transit", { stopIndex: 99 });
  assert.equal(offRoute.statusCode, 400);
});

test("the public tracking page shows progress but no personal details", async () => {
  // Customers may type it with spaces, dashes or lower case.
  const typed = `${roadTracking.slice(0, 4)}-${roadTracking.slice(4, 8)} ${roadTracking.slice(8)}`.toLowerCase();
  const res = await app.inject({ method: "GET", url: `/api/v1/track/${encodeURIComponent(typed)}` });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.trackingNumber, roadTracking);
  assert.equal(body.status, "delivered");
  assert.equal(body.origin, "Douala, Cameroon");
  assert.equal(body.route.length, 5);

  const text = res.body;
  // Package details (including contents) are shown; who the people are and where they live is not.
  assert.equal(body.contents, "Clothes");
  for (const secret of ["Ada Sender", "ada@example.com", "+237", "1 Rue A", "Ben Receiver"]) {
    assert.ok(!text.includes(secret), `public tracking leaked "${secret}"`);
  }
  // The customer's own position is blurred to about 11 km (1 decimal place).
  assert.deepEqual(body.route[0].location, { lat: 4.1, lng: 9.7 });

  // Statistics for the customer's page: size, distance (all covered once delivered), booking date.
  assert.deepEqual(body.dimensionsCm, { length: 40, width: 30, height: 20 });
  assert.ok(body.distance.totalKm > 150 && body.distance.totalKm < 300, `total ${body.distance.totalKm} km`);
  assert.equal(body.distance.coveredKm, body.distance.totalKm);
  assert.ok(body.bookedAt);
});

test("unknown tracking numbers return 404", async () => {
  const res = await app.inject({ method: "GET", url: "/api/v1/track/WBNOTREAL000" });
  assert.equal(res.statusCode, 404);
});

test("listing, searching and stats work", async () => {
  const all = await app.inject({ method: "GET", url: "/api/v1/shipments", headers: auth() });
  assert.equal(all.json().total, 2);
  assert.equal(all.json().items[0].sender.name, "Ada Sender");

  const byName = await app.inject({ method: "GET", url: "/api/v1/shipments?q=cleo", headers: auth() });
  assert.equal(byName.json().total, 1);
  const byStatus = await app.inject({ method: "GET", url: "/api/v1/shipments?status=delivered", headers: auth() });
  assert.equal(byStatus.json().total, 1);

  const stats = await app.inject({ method: "GET", url: "/api/v1/stats", headers: auth() });
  assert.equal(stats.json().total, 2);
  assert.equal(stats.json().byStatus.delivered, 1);
  assert.equal(stats.json().byStatus.pending, 1);
});

const track = async (trackingNumber: string) => (await app.inject({ method: "GET", url: `/api/v1/track/${trackingNumber}` })).json();

test("a manually entered vehicle position shows on the public map", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/shipments/${airTracking}/position`,
    headers: auth(),
    payload: { lat: 3.8, lng: 10.13, note: "Driver: passing Edea" },
  });
  assert.equal(res.statusCode, 200, res.body);

  const body = await track(airTracking);
  assert.equal(body.position.source, "manual");
  assert.equal(body.position.lat, 3.8);
  // Still at the first stop, but the driver has reported progress: some distance is covered.
  assert.ok(body.distance.coveredKm > 0 && body.distance.coveredKm < body.distance.totalKm);
  assert.equal(body.position.note, "Driver: passing Edea");
  assert.equal(body.trail.length, 1);
});

test("the vehicle's exact position is hidden near a customer's address", async () => {
  // About 150 m from the receiver's real address in Paris.
  await app.inject({ method: "POST", url: `/api/v1/shipments/${airTracking}/position`, headers: auth(), payload: { lat: 48.861, lng: 2.351 } });
  const body = await track(airTracking);
  assert.equal(body.position.source, "stop");
  assert.equal(body.trail.length, 1, "the private point is left out of the trail");
});

test("a status update newer than the vehicle position puts the marker back on the route stop", async () => {
  await app.inject({ method: "POST", url: `/api/v1/shipments/${airTracking}/position`, headers: auth(), payload: { lat: 4.5, lng: 9.9 } });
  await app.inject({ method: "POST", url: `/api/v1/shipments/${airTracking}/events`, headers: auth(), payload: { status: "in_transit" } });
  const body = await track(airTracking);
  assert.equal(body.position.source, "stop");
  assert.equal(body.position.note, "Douala Hub");
});

test("the GPS feed is switched off until a device key is configured", async () => {
  const res = await app.inject({ method: "POST", url: `/api/v1/gps/${airTracking}`, payload: { lat: 1, lng: 1 } });
  assert.equal(res.statusCode, 404);
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const multipartBody = (bytes: Buffer, type: string) => {
  const boundary = "----test-boundary";
  return {
    headers: { ...auth(), "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="package"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
};

test("package photos can be uploaded and are shown on the public page", async () => {
  const wrongType = await app.inject({ method: "POST", url: `/api/v1/shipments/${airTracking}/photos`, ...multipartBody(Buffer.from("hi"), "text/plain") });
  assert.equal(wrongType.statusCode, 400);

  const upload = await app.inject({ method: "POST", url: `/api/v1/shipments/${airTracking}/photos`, ...multipartBody(PNG, "image/png") });
  assert.equal(upload.statusCode, 201, upload.body);
  const photoId = upload.json()._id;

  const body = await track(airTracking);
  assert.deepEqual(body.photos, [photoId]);

  const image = await app.inject({ method: "GET", url: `/api/v1/track/${airTracking}/photos/${photoId}` });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/png");
  assert.ok(image.rawPayload.equals(PNG));

  // The photo can't be fetched through a different shipment's tracking number.
  const otherShipment = await app.inject({ method: "GET", url: `/api/v1/track/${roadTracking}/photos/${photoId}` });
  assert.equal(otherShipment.statusCode, 404);

  const removed = await app.inject({ method: "DELETE", url: `/api/v1/shipments/${airTracking}/photos/${photoId}`, headers: auth() });
  assert.equal(removed.statusCode, 204);
  assert.deepEqual((await track(airTracking)).photos, []);
});

test("photo upload requires the admin login", async () => {
  const { payload, headers } = multipartBody(PNG, "image/png");
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/shipments/${airTracking}/photos`,
    headers: { "content-type": headers["content-type"] },
    payload,
  });
  assert.equal(res.statusCode, 401);
});

test("the admin can edit the package and write a note the customer sees", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/v1/shipments/${airTracking}`,
    headers: auth(),
    payload: { package: { contents: "Shoes and clothes", weightKg: 6 }, notice: "Bring your ID when collecting" },
  });
  assert.equal(res.statusCode, 200, res.body);
  let body = await track(airTracking);
  assert.equal(body.contents, "Shoes and clothes");
  assert.equal(body.weightKg, 6);
  assert.equal(body.notice, "Bring your ID when collecting");

  await app.inject({ method: "PATCH", url: `/api/v1/shipments/${airTracking}`, headers: auth(), payload: { notice: "" } });
  body = await track(airTracking);
  assert.equal(body.notice, null);
});

test("changing the service re-plans the route", async () => {
  const res = await app.inject({ method: "PATCH", url: `/api/v1/shipments/${airTracking}`, headers: auth(), payload: { service: "road" } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().service, "road");
  const labels: string[] = res.json().route.map((stop: { label: string }) => stop.label);
  assert.ok(!labels.some((label) => label.includes("Airport") || label.includes("CDG")), labels.join(" -> "));
  assert.equal(labels[0], "Douala, Cameroon");
  assert.equal(labels.at(-1), "Paris, France");
});

test("the admin can set the route's hubs by hand", async () => {
  const hubs = (await app.inject({ method: "GET", url: "/api/v1/hubs", headers: auth() })).json().items as { _id: string; name: string }[];
  const id = (name: string) => hubs.find((hub) => hub.name === name)!._id;
  const res = await app.inject({
    method: "PUT",
    url: `/api/v1/shipments/${airTracking}/route`,
    headers: auth(),
    payload: { hubIds: [id("Douala Hub"), id("Douala Airport"), id("Paris CDG")] },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(
    res.json().route.map((stop: { label: string }) => stop.label),
    ["Douala, Cameroon", "Douala Hub", "Douala Airport", "Paris CDG", "Paris, France"],
  );
  const missing = await app.inject({ method: "PUT", url: `/api/v1/shipments/${airTracking}/route`, headers: auth(), payload: { hubIds: ["0123456789abcdef01234567"] } });
  assert.equal(missing.statusCode, 400);
});

test("a timeline entry posted by mistake can be removed, and the status goes back", async () => {
  const before = (await app.inject({ method: "GET", url: `/api/v1/shipments/${roadTracking}`, headers: auth() })).json();
  assert.equal(before.status, "delivered");
  const last = before.events.length - 1;

  const res = await app.inject({ method: "DELETE", url: `/api/v1/shipments/${roadTracking}/events/${last}`, headers: auth() });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().events.length, before.events.length - 1);
  assert.equal(res.json().status, "out_for_delivery");
  assert.equal(res.json().currentStop, 3);

  const first = await app.inject({ method: "DELETE", url: `/api/v1/shipments/${roadTracking}/events/0`, headers: auth() });
  assert.equal(first.statusCode, 400);
});

test("contact settings are public to read and admin-only to change", async () => {
  const empty = await app.inject({ method: "GET", url: "/api/v1/settings" });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.json().whatsappNumber, "");

  const payload = { whatsappNumber: "+237 600 000 000", supportEmail: "Help@Example.com", supportPhone: "+237 600 000 000" };
  const anonymous = await app.inject({ method: "PUT", url: "/api/v1/settings", payload });
  assert.equal(anonymous.statusCode, 401);

  const bad = await app.inject({ method: "PUT", url: "/api/v1/settings", headers: auth(), payload: { ...payload, whatsappNumber: "call me" } });
  assert.equal(bad.statusCode, 400);

  const saved = await app.inject({ method: "PUT", url: "/api/v1/settings", headers: auth(), payload });
  assert.equal(saved.statusCode, 200, saved.body);
  const now = (await app.inject({ method: "GET", url: "/api/v1/settings" })).json();
  assert.deepEqual(now, { whatsappNumber: "237600000000", supportEmail: "help@example.com", supportPhone: "+237 600 000 000" });
});

// ---- Delivery simulation and "move to next hub" ----

const { advanceSimulation, stopSimulation } = await import("../src/lib/simulation.js");
const MINUTE = 60_000;

async function bookRoad(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/shipments",
    headers: auth(),
    payload: { senderId: ids.douala, receiverId: ids.yaounde, service: "road", package: pkg },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().trackingNumber;
}
const detail = async (trackingNumber: string) => (await app.inject({ method: "GET", url: `/api/v1/shipments/${trackingNumber}`, headers: auth() })).json();

test("'move to next step' walks a shipment through every step to delivery", async () => {
  const tn = await bookRoad();
  const next = () => app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/next-stop`, headers: auth(), payload: { notify: true } });
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await next();
    assert.equal(res.statusCode, 200, res.body);
    seen.push(`${res.json().status}@${res.json().currentStop}`);
  }
  // Route: Douala -> Douala Hub -> Edea Depot -> Yaounde Hub -> Yaounde
  assert.deepEqual(seen, ["picked_up@0", "in_transit@1", "in_transit@2", "in_transit@3", "out_for_delivery@3", "delivered@4"]);
  const done = await next();
  assert.equal(done.statusCode, 400);
});

test("the simulation delivers by itself in the chosen time, posting each step once and in order", async () => {
  const tn = await bookRoad();
  const start = await app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/simulation`, headers: auth(), payload: { durationMinutes: 60, notify: true } });
  assert.equal(start.statusCode, 200, start.body);
  const started = start.json();
  assert.equal(started.status, "picked_up", "picked up as soon as it starts");
  assert.ok(started.simulationInfo, "dashboard sees the simulation running");
  assert.ok(Math.abs(new Date(started.estimatedDelivery).getTime() - (Date.now() + 60 * MINUTE)) < MINUTE, "estimate set to the arrival time");

  // The dashboard sees the simulated, moving position straight away. Customers see it too once the
  // vehicle is more than 2 km from the sender's address; right at the start it's still at the
  // sender's door, so the public map shows the area (the route stop) instead.
  assert.equal(started.vehicle.source, "estimate");
  const live = await track(tn);
  assert.equal(live.position.source, "stop");

  // Half way: some hubs reached, not delivered.
  await advanceSimulation(tn, new Date(Date.now() + 30 * MINUTE));
  const half = await detail(tn);
  assert.equal(half.status, "in_transit");
  assert.ok(half.currentStop >= 1 && half.currentStop <= 3, `currentStop ${half.currentStop}`);

  // Running it again for the same moment posts nothing new.
  const count = half.events.length;
  await advanceSimulation(tn, new Date(Date.now() + 30 * MINUTE));
  assert.equal((await detail(tn)).events.length, count);

  // After the arrival time: delivered, simulation over, every step there once, in time order.
  await advanceSimulation(tn, new Date(Date.now() + 61 * MINUTE));
  const end = await detail(tn);
  assert.equal(end.status, "delivered");
  assert.equal(end.currentStop, 4);
  assert.equal(end.simulationInfo, null);
  const steps = end.events.map((event: { status: string; location: string }) => `${event.status}:${event.location}`);
  assert.deepEqual(steps, [
    "pending:Douala, Cameroon",
    "picked_up:Douala, Cameroon",
    "in_transit:Douala Hub",
    "in_transit:Edea Depot",
    "in_transit:Yaounde Hub",
    "out_for_delivery:Yaounde Hub",
    "delivered:Yaounde, Cameroon",
  ]);
  const times = end.events.map((event: { timestamp: string }) => new Date(event.timestamp).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "timeline in time order");
});

test("stopping the simulation freezes the vehicle where it was; a manual update also stops it", async () => {
  const tn = await bookRoad();
  await app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/simulation`, headers: auth(), payload: { durationMinutes: 60 } });
  await stopSimulation(tn, new Date(Date.now() + 20 * MINUTE));
  const stopped = await detail(tn);
  assert.equal(stopped.simulationInfo, null);
  assert.equal(stopped.vehicle.source, "estimate");
  assert.ok(stopped.trail.length >= 1, "the driven line is kept");

  // Restart, then a manual status update takes over.
  await app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/simulation`, headers: auth(), payload: { durationMinutes: 120 } });
  assert.ok((await detail(tn)).simulationInfo);
  await app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/events`, headers: auth(), payload: { status: "at_customs" } });
  const manual = await detail(tn);
  assert.equal(manual.simulationInfo, null);
  assert.equal(manual.status, "at_customs");

  const tooShort = await app.inject({ method: "POST", url: `/api/v1/shipments/${tn}/simulation`, headers: auth(), payload: { durationMinutes: 1 } });
  assert.equal(tooShort.statusCode, 400);
});

test("a client with shipments can't be deleted", async () => {
  const res = await app.inject({ method: "DELETE", url: `/api/v1/clients/${ids.douala}`, headers: auth() });
  assert.equal(res.statusCode, 409);
});
