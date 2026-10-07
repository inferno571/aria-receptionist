import { AppError } from "./domain.ts";
import type { CallRecord, TranscriptLine } from "./domain.ts";
import { CALL_SECONDS, TOKEN_SECONDS } from "./voice-policy.ts";
import type { KeySource } from "./voice-policy.ts";

export class CallStore {
  db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async reconcile(owner: string, now = new Date()) {
    await this.db
      .prepare(
        "UPDATE calls SET status='interrupted', ended_at=CASE WHEN expires_at<>'' AND expires_at<? THEN expires_at ELSE ? END WHERE owner=? AND status='active' AND (expires_at<=? OR last_seen_at<?)",
      )
      .bind(
        now.toISOString(),
        now.toISOString(),
        owner,
        now.toISOString(),
        new Date(now.getTime() - 120000).toISOString(),
      )
      .run();
  }
  async reserve(owner: string, keySource: KeySource, now = new Date()) {
    await this.reconcile(owner, now);
    const stamp = now.toISOString(),
      day = stamp.slice(0, 10),
      hour = stamp.slice(0, 13);
    const id = crypto.randomUUID();
    const expiresAt = new Date(
      now.getTime() + CALL_SECONDS * 1000,
    ).toISOString();
    const permitUntil = new Date(
      now.getTime() + TOKEN_SECONDS * 1000,
    ).toISOString();
    const budgets = [{ bucket: `user-hour:${owner}:${hour}`, limit: 12 }];
    if (keySource === "shared")
      budgets.push(
        { bucket: `shared-user-day:${owner}:${day}`, limit: 5 },
        { bucket: `shared-day:${day}`, limit: 40 },
      );
    const statements = [
      this.db
        .prepare(
          "INSERT INTO calls(id,owner,started_at,status,expires_at,permit_until,last_seen_at,key_source,token_state) SELECT ?,?,?,'active',?,?,?,?,'pending' WHERE (SELECT COUNT(*) FROM calls WHERE owner=? AND permit_until>? AND token_state IN ('pending','issued'))<2 AND (?='personal' OR (SELECT COUNT(*) FROM calls WHERE key_source='shared' AND permit_until>? AND token_state IN ('pending','issued'))<5)",
        )
        .bind(
          id,
          owner,
          stamp,
          expiresAt,
          permitUntil,
          stamp,
          keySource,
          owner,
          stamp,
          keySource,
          stamp,
        ),
    ];
    statements.push(
      ...budgets.map((b) =>
        this.db
          .prepare(
            "INSERT INTO usage_budgets(bucket,used,max_count,expires_at) SELECT ?,1,?,? WHERE EXISTS(SELECT 1 FROM calls WHERE id=?) ON CONFLICT(bucket) DO UPDATE SET used=used+1",
          )
          .bind(
            b.bucket,
            b.limit,
            new Date(now.getTime() + 2 * 86400000).toISOString(),
            id,
          ),
      ),
    );
    let result: D1Result[];
    try {
      result = await this.db.batch(statements);
    } catch (error) {
      if (/usage_within_budget|CHECK constraint/.test(String(error)))
        throw new AppError(
          keySource === "shared"
            ? "The shared voice allowance is used up. Add your own Gemini key or try tomorrow."
            : "Too many session starts. Try again in an hour.",
          429,
        );
      throw error;
    }
    if (!result[0]?.meta.changes)
      throw new AppError(
        "Voice sessions are busy. Wait up to 15 minutes before starting another.",
        429,
      );
    // Bounded, non-authoritative counters can be retired after their window closes.
    await this.db
      .prepare(
        "DELETE FROM usage_budgets WHERE bucket IN (SELECT bucket FROM usage_budgets WHERE expires_at<? LIMIT 100)",
      )
      .bind(stamp)
      .run()
      .catch(() => {});
    return { id, expiresAt, permitUntil };
  }
  async issued(owner: string, id: string) {
    await this.db
      .prepare(
        "UPDATE calls SET token_state='issued' WHERE id=? AND owner=? AND token_state='pending'",
      )
      .bind(id, owner)
      .run();
  }
  async failed(owner: string, id: string, definitive: boolean) {
    await this.db
      .prepare(
        "UPDATE calls SET status='error',ended_at=?,token_state=CASE WHEN ?=1 THEN 'failed' ELSE token_state END WHERE id=? AND owner=?",
      )
      .bind(new Date().toISOString(), definitive ? 1 : 0, id, owner)
      .run();
  }
  async assertActive(owner: string, id: string, now = new Date()) {
    const call = await this.db
      .prepare(
        "SELECT id FROM calls WHERE id=? AND owner=? AND status='active' AND token_state='issued' AND deleted_at IS NULL AND expires_at>? AND last_seen_at>?",
      )
      .bind(
        id,
        owner,
        now.toISOString(),
        new Date(now.getTime() - 120000).toISOString(),
      )
      .first();
    if (!call)
      throw new AppError(
        "This call has ended or expired. Start a new conversation.",
        409,
      );
  }
  async noteBooking(owner: string, id: string) {
    await this.db
      .prepare(
        "UPDATE calls SET outcome=CASE WHEN outcome LIKE 'Follow-up:%' THEN outcome ELSE 'Appointment booked' END WHERE id=? AND owner=? AND deleted_at IS NULL",
      )
      .bind(id, owner)
      .run();
  }
  async requestFollowUp(owner: string, id: string, reason: unknown) {
    if (typeof reason !== "string" || !reason.trim())
      throw new AppError("Please provide a reason for the follow-up.");
    const result = await this.db
      .prepare(
        "UPDATE calls SET outcome=? WHERE id=? AND owner=? AND deleted_at IS NULL",
      )
      .bind(`Follow-up: ${reason.slice(0, 95)}`, id, owner)
      .run();
    if (!result.meta.changes)
      throw new AppError(
        "This call's history is no longer available. The follow-up was not saved.",
        409,
      );
  }
  async save(owner: string, x: Record<string, unknown>, now = new Date()) {
    if (
      typeof x.id !== "string" ||
      !["active", "completed", "error"].includes(String(x.status)) ||
      !Array.isArray(x.transcript) ||
      x.transcript.length > 300
    )
      throw new AppError("Invalid call record.");
    const transcript = x.transcript.map((line: unknown) => {
      if (!line || typeof line !== "object")
        throw new AppError("Invalid transcript entry.");
      const l = line as TranscriptLine;
      if (
        !["user", "assistant", "system"].includes(l.role) ||
        typeof l.text !== "string" ||
        l.text.length > 4000 ||
        typeof l.time !== "string" ||
        !Number.isFinite(Date.parse(l.time))
      )
        throw new AppError("Invalid transcript entry.");
      return { role: l.role, text: l.text, time: l.time };
    });
    if (JSON.stringify(transcript).length > 70000)
      throw new AppError("Transcript is too large.", 413);
    const result = await this.db
      .prepare(
        "UPDATE calls SET ended_at=?,status=?,duration_seconds=?,transcript=?,last_seen_at=? WHERE id=? AND owner=? AND status='active' AND deleted_at IS NULL AND (?<>'active' OR (token_state='issued' AND expires_at>? AND last_seen_at>?))",
      )
      .bind(
        x.status === "active" ? null : now.toISOString(),
        x.status,
        Math.max(
          0,
          Math.min(CALL_SECONDS, Math.round(Number(x.duration) || 0)),
        ),
        JSON.stringify(transcript),
        now.toISOString(),
        x.id,
        owner,
        x.status,
        now.toISOString(),
        new Date(now.getTime() - 120000).toISOString(),
      )
      .run();
    if (
      !result.meta.changes &&
      !(await this.db
        .prepare(
          "SELECT id FROM calls WHERE id=? AND owner=? AND deleted_at IS NULL",
        )
        .bind(x.id, owner)
        .first())
    )
      throw new AppError("Call not found.", 404);
  }
  async list(owner: string, cursor: string | null = null) {
    let before = "9999",
      id = "~";
    if (cursor) {
      try {
        const value = JSON.parse(atob(cursor));
        if (
          typeof value.t !== "string" ||
          typeof value.id !== "string" ||
          value.id.length > 80 ||
          !Number.isFinite(Date.parse(value.t))
        )
          throw new Error();
        before = value.t;
        id = value.id;
      } catch {
        throw new AppError("Invalid history cursor.");
      }
    }
    const { results } = await this.db
      .prepare(
        "SELECT id,started_at,ended_at,status,duration_seconds,transcript,outcome FROM calls WHERE owner=? AND deleted_at IS NULL AND (started_at<? OR (started_at=? AND id<?)) ORDER BY started_at DESC,id DESC LIMIT 21",
      )
      .bind(owner, before, before, id)
      .all<CallRecord>();
    const calls = results.slice(0, 20),
      last = calls.at(-1);
    return {
      calls,
      nextCursor:
        results.length > 20 && last
          ? btoa(JSON.stringify({ t: last.started_at, id: last.id }))
          : null,
    };
  }
  async remove(owner: string, id: string, now = new Date()) {
    await this.reconcile(owner, now);
    const existing = await this.db
      .prepare(
        "SELECT status FROM calls WHERE id=? AND owner=? AND deleted_at IS NULL",
      )
      .bind(id, owner)
      .first<{ status: string }>();
    if (!existing) throw new AppError("Call not found.", 404);
    if (existing.status === "active")
      throw new AppError("End this call before deleting its history.", 409);
    await this.db
      .prepare(
        "UPDATE calls SET deleted_at=?,transcript='[]',outcome='Deleted' WHERE id=? AND owner=?",
      )
      .bind(now.toISOString(), id, owner)
      .run();
  }
}
