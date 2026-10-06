import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveReceptionist } from "../lib/live-client.ts";
import { AudioOutput } from "../lib/audio.ts";
import type { Session } from "@google/genai";

function fixture() {
  const errors: string[] = [];
  const client = new LiveReceptionist({
    onState: () => {},
    onTranscript: () => {},
    onError: (e) => errors.push(e),
    onLevel: () => {},
    onAction: () => {},
    onSaved: () => {},
    onDuration: () => {},
  });
  client.running = true;
  return { client, errors };
}
test("tool response waits for reconnect and survives a closed socket", () => {
  const { client, errors } = fixture();
  let sends = 0;
  client.session = {
    sendToolResponse: () => {
      throw new Error("closed");
    },
  } as unknown as Session;
  client.deferredResponses.set("booking", {
    id: "booking",
    name: "create_booking",
    response: { status: "confirmed" },
  });
  client.reconnecting = true;
  client.flushResponses();
  assert.equal(errors.length, 0);
  assert.equal(client.deferredResponses.size, 1);
  client.reconnecting = false;
  assert.doesNotThrow(() => client.flushResponses());
  assert.equal(errors.length, 1);
  assert.equal(client.deferredResponses.size, 1);
  client.session = {
    sendToolResponse: () => {
      sends++;
    },
  } as unknown as Session;
  client.flushResponses();
  client.flushResponses();
  assert.equal(sends, 1);
  assert.equal(client.deferredResponses.size, 0);
});
test("cancelled tool responses never reach a resumed session", () => {
  const { client } = fixture();
  let sends = 0;
  client.session = {
    sendToolResponse: () => {
      sends++;
    },
  } as unknown as Session;
  client.deferredResponses.set("cancelled", {
    id: "cancelled",
    name: "create_booking",
    response: { status: "confirmed" },
  });
  client.cancelled.add("cancelled");
  client.flushResponses();
  assert.equal(sends, 0);
  assert.equal(client.deferredResponses.size, 0);
});
test("transcript checkpoints finish before the terminal save", async () => {
  const { client } = fixture();
  client.callId = "call";
  client.started = Date.now();
  const original = globalThis.fetch;
  const payloads: Record<string, unknown>[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = (async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    payloads.push(payload);
    if (payload.status === "active") await gate;
    return Response.json({ saved: true });
  }) as typeof fetch;
  try {
    const checkpoint = client.save("active");
    const terminal = client.save("completed");
    await Promise.resolve();
    assert.equal(payloads.length, 1);
    release();
    await Promise.all([checkpoint, terminal]);
    assert.deepEqual(
      payloads.map((p) => p.status),
      ["active", "completed"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("an interruption discards audio waiting for context resume", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let buffers = 0;
  const context = {
    resume: () => gate,
    currentTime: 0,
    createBuffer: () => {
      buffers++;
      throw new Error("Stale audio must not be created");
    },
  } as unknown as AudioContext;
  const output = new AudioOutput(context);
  const pending = output.enqueue(btoa("\0\0"));
  output.interrupt();
  release();
  await pending;
  assert.equal(buffers, 0);
});
test("stopping is idempotent and invalidates old connection generations", async () => {
  const { client } = fixture();
  let closed = 0;
  client.session = {
    close: () => {
      closed++;
    },
  } as unknown as Session;
  client.connectionGeneration = 4;
  const one = client.stop();
  const two = client.stop();
  assert.equal(one, two);
  await one;
  assert.equal(closed, 1);
  assert.equal(client.connectionGeneration, 5);
  assert.equal(client.running, false);
});
