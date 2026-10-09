import { env } from "cloudflare:workers";
import { getUser } from "./auth";
import { AppError } from "./domain";
import { BookingStore } from "./booking";
export { readJson as body } from "./request-body";
export async function owner(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new AppError("Cross-site requests are not allowed.", 403);
    const url = new URL(request.url);
    if (origin && origin !== url.origin)
      throw new AppError("Cross-origin requests are not allowed.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new AppError("Send JSON request data.", 415);
  }
  const user = await getUser();
  if (!user) throw new AppError("Sign in to use your reception desk.", 401);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const now = new Date();
    try {
      await store()
        .db.prepare(
          "INSERT INTO usage_budgets(bucket,used,max_count,expires_at) VALUES(?,1,80,?) ON CONFLICT(bucket) DO UPDATE SET used=used+1",
        )
        .bind(
          `api-minute:${user.id}:${now.toISOString().slice(0, 16)}`,
          new Date(now.getTime() + 3600000).toISOString(),
        )
        .run();
    } catch (error) {
      if (/usage_within_budget|CHECK constraint/.test(String(error)))
        throw new AppError(
          "Too many requests. Please wait a minute and try again.",
          429,
        );
      throw error;
    }
  }
  return user.id;
}
export function store() {
  if (!env.DB)
    throw new AppError(
      "The appointment database is unavailable. Please try again shortly.",
      503,
    );
  return new BookingStore(env.DB);
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return json(
      { error: error.message },
      error.status,
      error.status === 429 ? { "Retry-After": "900" } : {},
    );
  console.error(
    "Aria request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return json(
    {
      error:
        "We couldn't complete that request. Your previous bookings are safe. Please retry.",
    },
    503,
  );
}
