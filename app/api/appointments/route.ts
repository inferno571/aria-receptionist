import { owner, store, json, failure, body } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const id = await owner(request);
    const input = await body(request);
    return json({ appointment: await store().book(id, input) }, 201);
  } catch (e) {
    return failure(e);
  }
}
