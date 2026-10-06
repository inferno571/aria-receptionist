import { owner, store, json, failure, body } from "@/lib/server";
import { AppError } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    const who = await owner(request);
    const id = crypto.randomUUID();
    await store()
      .db.prepare(
        "INSERT INTO calls(id,owner,started_at,status) VALUES(?,?,?,'active')",
      )
      .bind(id, who, new Date().toISOString())
      .run();
    return json({ id });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const who = await owner(request);
    const x = await body(request);
    if (
      typeof x.id !== "string" ||
      !Array.isArray(x.transcript) ||
      x.transcript.length > 300
    )
      throw new AppError("Invalid call record.");
    const transcript = x.transcript.map((l: Record<string, unknown>) => {
      if (
        !["user", "assistant", "system"].includes(String(l.role)) ||
        typeof l.text !== "string" ||
        l.text.length > 5000 ||
        typeof l.time !== "string"
      )
        throw new AppError("Invalid transcript entry.");
      return { role: l.role, text: l.text, time: l.time };
    });
    const result = await store()
      .db.prepare(
        "UPDATE calls SET ended_at=?,status=?,duration_seconds=?,transcript=? WHERE id=? AND owner=? AND status='active'",
      )
      .bind(
        x.status === "active" ? null : new Date().toISOString(),
        ["active", "completed", "error"].includes(x.status)
          ? x.status
          : "completed",
        Math.max(0, Math.min(3600, Math.round(Number(x.duration) || 0))),
        JSON.stringify(transcript),
        x.id,
        who,
      )
      .run();
    if (!result.meta.changes) {
      const existing = await store()
        .db.prepare("SELECT id FROM calls WHERE id=? AND owner=?")
        .bind(x.id, who)
        .first();
      if (!existing) throw new AppError("Call not found.", 404);
    }
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
