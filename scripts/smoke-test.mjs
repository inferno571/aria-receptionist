import assert from "node:assert/strict";
import { localSession } from "./local-auth.mjs";

// This workflow writes synthetic records only to an explicitly local preview.
const base = process.env.ARIA_TEST_URL || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local preview for this test.");
const { cookie } = await localSession(base);
async function api(
  path,
  data,
  method = data === undefined ? "GET" : "POST",
  headers = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { status: response.status, value };
}
assert.equal((await fetch(base + "/api/dashboard")).status, 401);
assert.equal(
  (await api("/api/settings", {}, "PUT", { Origin: "https://unrelated.example" }))
    .status,
  403,
);
const missingKey = await api("/api/live-token", {});
assert.equal(missingKey.status, 428, JSON.stringify(missingKey.value));
const dashboard = await api("/api/dashboard");
assert.equal(dashboard.status, 200);
const date = new Date(
  Date.parse(dashboard.value.today + "T00:00:00Z") + 86400000 * 29,
)
  .toISOString()
  .slice(0, 10);
const available = await api(
  `/api/availability?date=${date}&serviceId=haircut&staffId=mira`,
);
assert.equal(available.status, 200);
assert.ok(available.value.slots.length);
const input = {
  customerName: "API test customer",
  phone: "5550100123",
  date,
  time: available.value.slots[0].time,
  serviceId: "haircut",
  staffId: "mira",
  confirmed: true,
  requestId: crypto.randomUUID(),
};
const requests = await Promise.all([
  api("/api/appointments", input),
  api("/api/appointments", { ...input, requestId: crypto.randomUUID() }),
]);
assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
const saved = requests.find((r) => r.status === 201).value.appointment;
try {
  const replay = await api("/api/appointments", {
    ...input,
    requestId: saved.request_id,
  });
  assert.equal(replay.value.appointment.id, saved.id);
  assert.equal((await api("/api/calls", {})).status, 405);
  assert.equal(
    (
      await api("/api/tools", {
        callId: "not-a-real-call",
        toolCallId: "late",
        name: "request_human",
        args: { reason: "Must not be saved" },
      })
    ).status,
    409,
  );
  assert.equal((await api("/api/settings", null, "PUT")).status, 400);
  assert.equal((await api("/api/calls?before=invalid")).status, 400);
} finally {
  assert.equal(
    (await api("/api/appointments/" + saved.id, {}, "DELETE")).status,
    200,
  );
  assert.equal(
    (await api("/api/appointments/" + saved.id, {}, "DELETE")).status,
    200,
  );
}
const restored = await api(
  `/api/availability?date=${date}&serviceId=haircut&staffId=mira`,
);
assert.ok(restored.value.slots.some((s) => s.time === input.time));
console.log(
  "API smoke checks passed: authentication, origin validation, missing key, D1 overlap race, replay, cancellation, rejected unissued calls, strict JSON bodies and history cursors. Synthetic local history retained.",
);
