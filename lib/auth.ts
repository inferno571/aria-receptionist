import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import {
  authUsers,
  authSessions,
  authAccounts,
  authVerification,
  authRateLimits,
} from "@/db/schema";

export function auth() {
  const baseURL =
    env.BETTER_AUTH_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:5173" : undefined);
  if (!env.DB || !env.BETTER_AUTH_SECRET || !baseURL)
    throw new Error("Authentication is not configured.");
  return betterAuth({
    appName: "Aria",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), {
      provider: "sqlite",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerification,
        rateLimit: authRateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "aria",
      useSecureCookies: baseURL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    trustedOrigins: [baseURL],
  });
}

export async function getUser() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
