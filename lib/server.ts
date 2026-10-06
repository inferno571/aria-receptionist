import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AppError } from "./domain";
import { BookingStore } from "./booking";
export async function owner(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);
    if (origin && origin !== url.origin)
      throw new AppError("Cross-origin requests are not allowed.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new AppError("Send JSON request data.", 415);
  }
  const user = await getChatGPTUser();
  if (!user) throw new AppError("Sign in to use your reception desk.", 401);
  return user.userId;
}
export function store() {
  if (!env.DB)
    throw new AppError(
      "The appointment database is unavailable. Please try again shortly.",
      503,
    );
  return new BookingStore(env.DB);
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
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
export async function body(request: Request) {
  const text = await request.text();
  if (text.length > 100000) throw new AppError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Request must contain valid JSON.");
  }
}
