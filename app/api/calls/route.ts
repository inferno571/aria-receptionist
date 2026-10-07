import { owner, store, json, failure, body } from "@/lib/server";
import { CallStore } from "@/lib/call-store";
export async function GET(request: Request) {
  try {
    const who = await owner(request),
      calls = new CallStore(store().db);
    await calls.reconcile(who);
    return json(
      await calls.list(who, new URL(request.url).searchParams.get("before")),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const who = await owner(request);
    await new CallStore(store().db).save(who, await body(request));
    return json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
