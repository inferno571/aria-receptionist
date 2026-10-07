import { env } from "cloudflare:workers";
import { owner, store, json, failure } from "@/lib/server";
import { MODEL, SERVICES, STAFF, salonDate } from "@/lib/domain";
import { CallStore } from "@/lib/call-store";
export async function GET(request: Request) {
  try {
    const id = await owner(request);
    const s = store();
    const history = new CallStore(s.db);
    await history.reconcile(id);
    const [appointments, business, calls] = await Promise.all([
      s.list(id),
      s.business(id),
      history.list(id),
    ]);
    return json({
      appointments,
      business,
      calls: calls.calls,
      nextCursor: calls.nextCursor,
      services: SERVICES,
      staff: STAFF,
      today: salonDate(),
      model: MODEL,
      hasServerKey: !!env.GEMINI_API_KEY,
    });
  } catch (e) {
    return failure(e);
  }
}
