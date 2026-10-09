import { auth } from "@/lib/auth";
import { readJson } from "@/lib/request-body";
import { failure } from "@/lib/server";

export async function GET(request: Request) {
  return auth().handler(request);
}
export async function POST(request: Request) {
  try {
    // Bound request parsing before the authentication library processes it.
    const input = await readJson(request, 16384);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return await auth().handler(
      new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(input),
        signal: request.signal,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
