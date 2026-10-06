import { env } from "cloudflare:workers";
import { owner, store, json, failure } from "@/lib/server";
import { MODEL, SERVICES, STAFF, salonDate } from "@/lib/domain";
export async function GET(request: Request) {
  try {
    const id = await owner(request);
    const s = store();
    const [appointments, business, calls] = await Promise.all([
      s.list(id),
      s.business(id),
      s.db
        .prepare(
          "SELECT id,started_at,ended_at,status,duration_seconds,transcript,outcome FROM calls WHERE owner=? ORDER BY started_at DESC LIMIT 20",
        )
        .bind(id)
        .all(),
    ]);
    return json({
      appointments,
      business,
      calls: calls.results,
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
