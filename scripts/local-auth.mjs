import { randomUUID } from "node:crypto";
export async function localSession(base) {
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Synthetic accounts are only allowed on a local preview.");
  const email = `smoke-${randomUUID()}@example.test`;
  const password = randomUUID() + "Aa9!";
  const ip = `192.0.2.${1 + Math.floor(Math.random() * 250)}`;
  const response = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({ name: "Synthetic API check", email, password }),
  });
  if (!response.ok)
    throw new Error(
      `Synthetic registration failed (${response.status}): ${await response.text()}`,
    );
  const cookie = response.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("Registration did not set a session cookie.");
  return { cookie, email, password, ip };
}
