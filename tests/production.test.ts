import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { CallStore } from "../lib/call-store.ts";
import { selectVoiceKey } from "../lib/voice-policy.ts";
import { appendTranscript } from "../lib/transcript.ts";
import { readJson } from "../lib/request-body.ts";
import { mintVoiceToken, TOKEN_FIELD_MASK } from "../lib/gemini-token.ts";
import type { TranscriptLine } from "../lib/domain.ts";
const NOW = new Date("2026-10-07T06:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60000);
test("personal key overrides fallback and empty input selects shared", () => {
  const own = "personal-placeholder-key",
    shared = "shared-placeholder-key";
  assert.deepEqual(selectVoiceKey(` ${own} `, shared), {
    key: own,
    keySource: "personal",
  });
  assert.deepEqual(selectVoiceKey(" ", shared), {
    key: shared,
    keySource: "shared",
  });
  assert.throws(() => selectVoiceKey("bad", shared));
  assert.throws(() => selectVoiceKey(undefined, undefined));
});
test("concurrent user permits are bounded and rejected attempts consume no budget", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  const result = await Promise.allSettled([
    calls.reserve("one", "shared", NOW),
    calls.reserve("one", "shared", NOW),
    calls.reserve("one", "shared", NOW),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 2);
  assert.deepEqual(
    sqlite
      .prepare("SELECT used FROM usage_budgets")
      .all()
      .map((x) => x.used),
    [2, 2, 2],
  );
  sqlite.close();
});
test("shared global concurrency is bounded while personal keys remain independent", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      calls.reserve(`user-${i}`, "shared", NOW),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  await calls.reserve("personal-user", "personal", NOW);
  assert.equal(
    sqlite
      .prepare(
        "SELECT used FROM usage_budgets WHERE bucket='shared-day:2026-10-07'",
      )
      .get()!.used,
    5,
  );
  sqlite.close();
});
test("shared daily user budget rolls back the excess call reservation", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  for (let i = 0; i < 5; i++)
    await calls.reserve("one", "shared", later(i * 16));
  await assert.rejects(calls.reserve("one", "shared", later(90)), /allowance/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM calls").get()!.n, 5);
  sqlite.close();
});
test("shared daily global budget atomically rejects the forty-first admission", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  for (let i = 0; i < 40; i++)
    await calls.reserve(`user-${i}`, "shared", later(i * 16));
  await assert.rejects(
    calls.reserve("extra", "shared", later(640)),
    /allowance/,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM calls").get()!.n, 40);
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM usage_budgets WHERE bucket LIKE '%extra%'",
      )
      .get()!.n,
    0,
  );
  sqlite.close();
});
test("stale heartbeat cannot reactivate authorization and lease expiry is enforced", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  const a = await calls.reserve("one", "personal", NOW);
  await calls.issued("one", a.id);
  await calls.assertActive("one", a.id, NOW);
  await assert.rejects(calls.assertActive("other", a.id, NOW));
  await assert.rejects(calls.assertActive("one", a.id, later(3)));
  await calls.save(
    "one",
    { id: a.id, status: "active", transcript: [], duration: 180 },
    later(3),
  );
  await assert.rejects(calls.assertActive("one", a.id, later(3)));
  await calls.reconcile("one", later(3));
  assert.equal(
    sqlite.prepare("SELECT status FROM calls").get()!.status,
    "interrupted",
  );
  sqlite.close();
});
test("ended and deleted history never release an unexpired token permit", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  for (let i = 0; i < 2; i++) {
    const a = await calls.reserve("one", "personal", NOW);
    await calls.issued("one", a.id);
    await calls.save(
      "one",
      { id: a.id, status: "completed", transcript: [], duration: 1 },
      NOW,
    );
    await calls.remove("one", a.id, NOW);
  }
  assert.equal((await calls.list("one")).calls.length, 0);
  await assert.rejects(calls.reserve("one", "personal", later(1)), /busy/);
  await calls.reserve("one", "personal", later(16));
  sqlite.close();
});
test("terminal saves remain monotonic and retain the server-owned follow-up", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  const a = await calls.reserve("one", "personal", NOW);
  await calls.issued("one", a.id);
  sqlite
    .prepare("UPDATE calls SET outcome=? WHERE id=?")
    .run("Follow-up: Call back", a.id);
  const transcript = [
    { role: "system", text: "Finished", time: NOW.toISOString() },
  ];
  await calls.save(
    "one",
    { id: a.id, status: "completed", duration: 5, transcript },
    NOW,
  );
  await calls.save(
    "one",
    {
      id: a.id,
      status: "active",
      duration: 0,
      transcript: [],
      outcome: "Conversation",
    },
    NOW,
  );
  const row = (await calls.list("one")).calls[0];
  assert.equal(row.status, "completed");
  assert.equal(row.outcome, "Follow-up: Call back");
  assert.equal(row.duration_seconds, 5);
  assert.deepEqual(JSON.parse(row.transcript), transcript);
  sqlite.close();
});
test("in-flight tool outcomes cannot restore deleted follow-up content", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  const a = await calls.reserve("one", "personal", NOW);
  await calls.issued("one", a.id);
  await calls.assertActive("one", a.id, NOW);
  await assert.rejects(calls.requestFollowUp("other", a.id, "Private note"));
  await calls.requestFollowUp("one", a.id, "Call back");
  await calls.noteBooking("one", a.id);
  assert.equal(
    (await calls.list("one")).calls[0].outcome,
    "Follow-up: Call back",
  );
  await calls.save(
    "one",
    { id: a.id, status: "completed", transcript: [], duration: 5 },
    NOW,
  );
  await calls.remove("one", a.id, NOW);
  await assert.rejects(
    calls.requestFollowUp("one", a.id, "Delayed private note"),
    /not saved/,
  );
  await calls.noteBooking("one", a.id);
  const row = sqlite
    .prepare("SELECT outcome,transcript FROM calls WHERE id=?")
    .get(a.id)!;
  assert.equal(row.outcome, "Deleted");
  assert.equal(row.transcript, "[]");
  assert.equal((await calls.list("one")).calls.length, 0);
  sqlite.close();
});

test("history cursors paginate without duplicates and deletion respects ownership", async () => {
  const { store, sqlite } = fixture();
  const calls = new CallStore(store.db);
  for (let i = 0; i < 22; i++)
    sqlite
      .prepare(
        "INSERT INTO calls(id,owner,started_at,status) VALUES(?,?,?,'completed')",
      )
      .run(String(i).padStart(2, "0"), "one", NOW.toISOString());
  const first = await calls.list("one");
  assert.equal(first.calls.length, 20);
  const second = await calls.list("one", first.nextCursor);
  assert.equal(second.calls.length, 2);
  assert.equal(
    new Set([...first.calls, ...second.calls].map((x) => x.id)).size,
    22,
  );
  await assert.rejects(calls.remove("other", "00", NOW), /not found/);
  await calls.remove("one", "00", NOW);
  assert.equal(
    sqlite.prepare("SELECT transcript,outcome FROM calls WHERE id='00'").get()!
      .outcome,
    "Deleted",
  );
  sqlite.close();
});
test("long transcripts split safely and explicitly mark trimmed history", () => {
  let lines: TranscriptLine[] = [];
  lines = appendTranscript(lines, "user", "a".repeat(9000), true);
  assert.equal(lines.length, 3);
  for (let i = 0; i < 30; i++)
    lines = appendTranscript(lines, "assistant", "न".repeat(4000), true);
  assert.ok(lines.every((x) => x.text.length <= 4000));
  assert.ok(JSON.stringify(lines).length < 70000);
  assert.match(lines[0].text, /trimmed/);
});
test("request parser rejects invalid, oversized and malformed UTF-8 bodies", async () => {
  for (const payload of ["null", "[]", "oops"])
    await assert.rejects(
      readJson(
        new Request("https://local/", { method: "POST", body: payload }),
      ),
      /JSON/,
    );
  await assert.rejects(
    readJson(
      new Request("https://local/", { method: "POST", body: "x".repeat(20) }),
      10,
    ),
    /too large/,
  );
  await assert.rejects(
    readJson(
      new Request("https://local/", {
        method: "POST",
        body: new Uint8Array([255, 255]),
      }),
    ),
    /UTF-8/,
  );
});
test("token wire constraints lock business tools while allowing resumption", async () => {
  const original = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ name: "auth_tokens/test-token" });
  }) as typeof fetch;
  try {
    await mintVoiceToken(
      "placeholder-key-for-unit-test",
      {
        systemInstruction: "Synthetic test",
        tools: [{ functionDeclarations: [{ name: "check_availability" }] }],
        sessionResumption: {},
      },
      later(15).toISOString(),
    );
    assert.equal(sent.fieldMask, TOKEN_FIELD_MASK);
    assert.ok(!String(sent.fieldMask).includes("sessionResumption"));
    assert.equal(sent.expireTime, later(15).toISOString());
    assert.equal(sent.uses, 1);
  } finally {
    globalThis.fetch = original;
  }
});
