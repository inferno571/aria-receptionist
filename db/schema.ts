import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const appointments = sqliteTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    requestId: text("request_id").notNull(),
    payload: text("payload").notNull(),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    serviceId: text("service_id").notNull(),
    staffId: text("staff_id").notNull(),
    date: text("date").notNull(),
    startMinute: integer("start_minute").notNull(),
    duration: integer("duration").notNull(),
    status: text("status").notNull().default("confirmed"),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("appointments_request").on(t.owner, t.requestId),
    index("appointments_calendar").on(t.owner, t.date, t.status),
  ],
);
export const occupiedSlots = sqliteTable(
  "occupied_slots",
  {
    owner: text("owner").notNull(),
    staffId: text("staff_id").notNull(),
    date: text("date").notNull(),
    minute: integer("minute").notNull(),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.staffId, t.date, t.minute] }),
    index("slots_appointment").on(t.appointmentId),
  ],
);
export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    status: text("status").notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    transcript: text("transcript").notNull().default("[]"),
    outcome: text("outcome").notNull().default("Conversation"),
    expiresAt: text("expires_at").notNull().default(""),
    permitUntil: text("permit_until").notNull().default(""),
    lastSeenAt: text("last_seen_at").notNull().default(""),
    keySource: text("key_source").notNull().default("unknown"),
    tokenState: text("token_state").notNull().default("none"),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    index("calls_owner_date").on(t.owner, t.startedAt),
    index("calls_permits").on(t.keySource, t.permitUntil, t.tokenState),
  ],
);
export const usageBudgets = sqliteTable(
  "usage_budgets",
  {
    bucket: text("bucket").primaryKey(),
    used: integer("used").notNull(),
    maxCount: integer("max_count").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [
    check("usage_within_budget", sql`${t.used} <= ${t.maxCount}`),
    index("usage_expiry").on(t.expiresAt),
  ],
);
export const settings = sqliteTable("settings", {
  owner: text("owner").primaryKey(),
  value: text("value").notNull(),
});
