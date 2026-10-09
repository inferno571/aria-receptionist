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

export const authUsers = sqliteTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_sessions_user").on(t.userId)],
);
export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("auth_accounts_user").on(t.userId),
    uniqueIndex("auth_accounts_provider").on(t.providerId, t.accountId),
  ],
);
export const authVerification = sqliteTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("auth_verification_identifier").on(t.identifier)],
);
export const authRateLimits = sqliteTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
