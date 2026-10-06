import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { BookingStore } from "../lib/booking.ts";
import {
  validateDate,
  salonDate,
  startMinute,
  slotMinutes,
} from "../lib/domain.ts";
import { decodePcm, pcmToBase64 } from "../lib/audio.ts";
const NOW = new Date("2026-10-06T06:00:00Z");
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync(new URL("../drizzle/", import.meta.url)).filter(
    (f) => f.endsWith(".sql"),
  ))
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"),
    );
  class Statement {
    sql: string;
    args: SQLInputValue[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...args: SQLInputValue[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.args),
        success: true,
      };
    }
    runSync() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
    async run() {
      return this.runSync();
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s.runSync());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { store: new BookingStore(db as unknown as D1Database), sqlite };
}
const input = (overrides: Record<string, unknown> = {}) => ({
  customerName: "Aditi Sharma",
  phone: "+91 98765 43210",
  date: "2026-10-07",
  time: "14:00",
  staffId: "mira",
  serviceId: "haircut",
  requestId: crypto.randomUUID(),
  confirmed: true,
  ...overrides,
});
test("concurrent retries return one booking and one set of occupied slots", async () => {
  const { store, sqlite } = fixture();
  const x = input();
  const result = await Promise.all([
    store.book("salon", x, NOW),
    store.book("salon", x, NOW),
  ]);
  assert.equal(result[0].id, result[1].id);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get()!.n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM occupied_slots").get()!.n,
    3,
  );
  sqlite.close();
});
test("overlapping concurrent requests have one winner and fully roll back the loser", async () => {
  const { store, sqlite } = fixture();
  const result = await Promise.allSettled([
    store.book("salon", input(), NOW),
    store.book("salon", input({ time: "14:30" }), NOW),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get()!.n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM occupied_slots").get()!.n,
    3,
  );
  sqlite.close();
});
test("collision on later occupied slot rolls back earlier inserted slots", async () => {
  const { store, sqlite } = fixture();
  await store.book("salon", input({ time: "14:30" }), NOW);
  await assert.rejects(
    store.book("salon", input({ time: "14:00" }), NOW),
    /just booked/,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get()!.n,
    1,
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM occupied_slots WHERE minute<870")
      .get()!.n,
    0,
  );
  sqlite.close();
});
test("reusing an idempotency key with changed data is rejected", async () => {
  const { store, sqlite } = fixture();
  const x = input();
  await store.book("salon", x, NOW);
  await assert.rejects(
    store.book("salon", { ...x, customerName: "Someone Else" }, NOW),
    /different booking/,
  );
  sqlite.close();
});
test("adjacent bookings and different stylists are allowed", async () => {
  const { store, sqlite } = fixture();
  await store.book("salon", input(), NOW);
  await store.book("salon", input({ time: "14:45" }), NOW);
  await store.book("salon", input({ staffId: "aarav" }), NOW);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get()!.n,
    3,
  );
  sqlite.close();
});
test("cancellation releases slots, is repeatable, and respects tenant ownership", async () => {
  const { store, sqlite } = fixture();
  const saved = await store.book("salon", input(), NOW);
  await assert.rejects(store.cancel("other-salon", saved.id), /not found/);
  await store.cancel("salon", saved.id);
  await store.cancel("salon", saved.id);
  await store.book("salon", input(), NOW);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM occupied_slots").get()!.n,
    3,
  );
  sqlite.close();
});
test("same request key is isolated by salon, and replay returns original result", async () => {
  const { store, sqlite } = fixture();
  const x = input();
  const a = await store.book("one", x, NOW);
  const b = await store.book("two", x, NOW);
  assert.notEqual(a.id, b.id);
  await store.cancel("one", a.id);
  assert.equal((await store.book("one", x, NOW)).status, "cancelled");
  sqlite.close();
});
test("availability removes all overlapping starts but retains adjacent start", async () => {
  const { store, sqlite } = fixture();
  await store.book("salon", input(), NOW);
  const available = await store.availability(
    "salon",
    "2026-10-07",
    "haircut",
    "mira",
    NOW,
  );
  for (const time of ["13:30", "13:45", "14:00", "14:15", "14:30"])
    assert.ok(!available.slots.some((s) => s.time === time));
  assert.ok(available.slots.some((s) => s.time === "14:45"));
  sqlite.close();
});
test("booking validates confirmation, hours, future time, staff and service", async () => {
  const { store, sqlite } = fixture();
  for (const override of [
    { confirmed: false },
    { time: "18:30", serviceId: "spa" },
    { date: "2026-10-06", time: "10:00" },
    { staffId: "unknown" },
    { serviceId: "unknown" },
    { phone: "abc" },
  ])
    await assert.rejects(store.book("salon", input(override), NOW));
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM appointments").get()!.n,
    0,
  );
  sqlite.close();
});
test("salon calendar uses IST at UTC midnight boundaries and rejects normalized invalid dates", () => {
  assert.equal(salonDate(new Date("2026-10-06T20:00:00Z")), "2026-10-07");
  assert.throws(
    () => validateDate("2026-02-30", new Date("2026-02-01")),
    /does not exist/,
  );
  assert.throws(() => startMinute("10:17"), /15 minutes/);
  assert.deepEqual(slotMinutes(600, 45), [600, 615, 630]);
});
test("PCM codec preserves signed little-endian samples and rejects odd byte count", () => {
  const bytes = new ArrayBuffer(6);
  const view = new DataView(bytes);
  view.setInt16(0, -32768, true);
  view.setInt16(2, 0, true);
  view.setInt16(4, 16384, true);
  assert.deepEqual([...decodePcm(pcmToBase64(bytes))], [-1, 0, 0.5]);
  assert.throws(() => decodePcm(btoa("a")), /Invalid PCM/);
});
