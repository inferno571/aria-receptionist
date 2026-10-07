import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { BookingStore } from "../lib/booking.ts";
export function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"),
    );
  class Statement {
    sql: string;
    args: SQLInputValue[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...args: SQLInputValue[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.args),
        success: true,
      };
    }
    runSync() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
    async run() {
      return this.runSync();
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s.runSync());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { store: new BookingStore(db as unknown as D1Database), sqlite };
}
