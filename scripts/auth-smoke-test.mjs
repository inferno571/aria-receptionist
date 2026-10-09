import assert from "node:assert/strict";
import { localSession } from "./local-auth.mjs";
const base = "http://127.0.0.1:5173";
const oversized = await fetch(base + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(JSON.stringify({ email: "x".repeat(20000) })),
      );
      controller.close();
    },
  }),
  duplex: "half",
  signal: AbortSignal.timeout(5000),
});
assert.equal(
  oversized.status,
  413,
  "Oversized streamed bodies reject promptly without a Content-Length header",
);
const one = await localSession(base);
const two = await localSession(base);
async function request(path, session, data, origin = base) {
  return fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: {
      Cookie: session.cookie,
      "Content-Type": "application/json",
      Origin: origin,
      "cf-connecting-ip": session.ip,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
assert.equal(
  (
    await fetch(base + "/api/dashboard", {
      headers: {
        "oai-authenticated-user-id": "forged",
        "oai-authenticated-user-email": "forged@example.test",
      },
    })
  ).status,
  401,
);
const a = await (await request("/api/auth/get-session", one)).json();
const b = await (await request("/api/auth/get-session", two)).json();
assert.notEqual(a.user.id, b.user.id);
assert.equal(a.user.emailVerified, false);
assert.equal(
  (
    await request("/api/auth/sign-in/email", one, {
      email: one.email,
      password: "incorrect-password",
    })
  ).status,
  401,
);
assert.equal(
  (await request("/api/auth/sign-out", one, {}, "https://attacker.example"))
    .status,
  403,
);
assert.equal((await request("/api/dashboard", one)).status, 200);
const tampered = { ...one, cookie: one.cookie.replace(/=./, "=x") };
assert.equal((await request("/api/dashboard", tampered)).status, 401);
assert.equal((await request("/api/auth/sign-out", one, {})).status, 200);
assert.equal((await request("/api/dashboard", one)).status, 401);
assert.equal((await request("/api/dashboard", two)).status, 200);
const login = await request("/api/auth/sign-in/email", one, {
  email: one.email,
  password: one.password,
});
assert.equal(login.status, 200);
assert.ok(
  login.headers
    .getSetCookie()
    .some((x) => /HttpOnly/i.test(x) && /SameSite=Lax/i.test(x)),
);
for (let i = 0; i < 4; i++)
  await request("/api/auth/sign-in/email", one, {
    email: one.email,
    password: "wrong-password-again",
  });
assert.equal(
  (
    await request("/api/auth/sign-in/email", one, {
      email: one.email,
      password: one.password,
    })
  ).status,
  429,
);
console.log(
  "Authentication checks passed: registration, sign-in, separate accounts, rejected forged headers/cookies, CSRF, revocation, cookie flags and rate limits.",
);
