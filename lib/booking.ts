import {
  AppError,
  STAFF,
  DEFAULT_BUSINESS,
  validateDate,
  serviceById,
  staffById,
  startMinute,
  slotMinutes,
  isFutureSlot,
  minuteTime,
  salonDate,
} from "./domain.ts";
import type { Appointment, Business } from "./domain.ts";

export type BookingInput = {
  customerName: string;
  phone: string;
  serviceId: string;
  staffId: string;
  date: string;
  time: string;
  requestId: string;
  confirmed: boolean;
  source?: string;
};
export class BookingStore {
  db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async business(owner: string): Promise<Business> {
    const row = await this.db
      .prepare("SELECT value FROM settings WHERE owner=?")
      .bind(owner)
      .first<{ value: string }>();
    return row
      ? { ...DEFAULT_BUSINESS, ...JSON.parse(row.value) }
      : DEFAULT_BUSINESS;
  }
  async list(owner: string) {
    const r = await this.db
      .prepare(
        "SELECT * FROM appointments WHERE owner=? AND date>=? ORDER BY date,start_minute LIMIT 100",
      )
      .bind(owner, salonDate())
      .all<Appointment>();
    return r.results;
  }
  async availability(
    owner: string,
    date: string,
    serviceId: string,
    staffId?: string,
    now = new Date(),
  ) {
    validateDate(date, now);
    const service = serviceById(serviceId);
    if (staffId) staffById(staffId);
    const locks = await this.db
      .prepare(
        "SELECT staff_id,minute FROM occupied_slots WHERE owner=? AND date=?",
      )
      .bind(owner, date)
      .all<{ staff_id: string; minute: number }>();
    const occupied = new Set(
      locks.results.map((x) => `${x.staff_id}:${x.minute}`),
    );
    const slots = [];
    for (let start = 600; start + service.duration <= 1140; start += 15) {
      if (!isFutureSlot(date, start, now)) continue;
      for (const staff of STAFF) {
        if (staffId && staff.id !== staffId) continue;
        if (
          slotMinutes(start, service.duration).every(
            (m) => !occupied.has(`${staff.id}:${m}`),
          )
        )
          slots.push({
            time: minuteTime(start),
            staffId: staff.id,
            staffName: staff.name,
          });
      }
    }
    return { date, service, timezone: "Asia/Kolkata", slots };
  }
  async book(owner: string, input: BookingInput, now = new Date()) {
    if (input.confirmed !== true)
      throw new AppError(
        "Please confirm the appointment details before booking.",
      );
    if (
      typeof input.customerName !== "string" ||
      input.customerName.trim().length < 2 ||
      input.customerName.length > 80
    )
      throw new AppError("Enter a customer name between 2 and 80 characters.");
    if (
      typeof input.phone !== "string" ||
      !/^[+\d\s()-]{8,24}$/.test(input.phone) ||
      input.phone.replace(/\D/g, "").length < 8
    )
      throw new AppError("Enter a valid contact phone number.");
    if (
      typeof input.requestId !== "string" ||
      input.requestId.length < 8 ||
      input.requestId.length > 150
    )
      throw new AppError("A valid booking request ID is required.");
    const service = serviceById(input.serviceId);
    staffById(input.staffId);
    const start = startMinute(input.time);
    const payload = JSON.stringify({
      name: input.customerName.trim(),
      phone: input.phone.replace(/[\s()-]/g, ""),
      service: service.id,
      staff: input.staffId,
      date: input.date,
      start,
    });
    const existing = await this.byRequest(owner, input.requestId);
    if (existing) {
      if (existing.payload !== payload)
        throw new AppError(
          "This request ID belongs to a different booking.",
          409,
        );
      return existing;
    }
    validateDate(input.date, now);
    if (start < 600 || start + service.duration > 1140)
      throw new AppError(
        "The salon is open 10:00 AM–7:00 PM IST. Choose a time that fits your service.",
      );
    if (!isFutureSlot(input.date, start, now))
      throw new AppError("That appointment time has already passed.");
    const id = crypto.randomUUID();
    const insert = this.db
      .prepare(
        "INSERT INTO appointments(id,owner,request_id,payload,customer_name,phone,service_id,staff_id,date,start_minute,duration,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'confirmed',?,?)",
      )
      .bind(
        id,
        owner,
        input.requestId,
        payload,
        input.customerName.trim(),
        input.phone.replace(/[\s()-]/g, ""),
        service.id,
        input.staffId,
        input.date,
        start,
        service.duration,
        input.source === "voice" ? "voice" : "manual",
        now.toISOString(),
      );
    const locks = slotMinutes(start, service.duration).map((m) =>
      this.db
        .prepare(
          "INSERT INTO occupied_slots(owner,staff_id,date,minute,appointment_id) VALUES(?,?,?,?,?)",
        )
        .bind(owner, input.staffId, input.date, m, id),
    );
    try {
      await this.db.batch([insert, ...locks]);
    } catch (error) {
      const retry = await this.byRequest(owner, input.requestId);
      if (retry) {
        if (retry.payload !== payload)
          throw new AppError(
            "This request ID belongs to a different booking.",
            409,
          );
        return retry;
      }
      if (String(error).includes("UNIQUE constraint"))
        throw new AppError(
          "That time was just booked. Please choose another available time.",
          409,
        );
      throw error;
    }
    return (await this.db
      .prepare("SELECT * FROM appointments WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<Appointment>())!;
  }
  async byRequest(owner: string, id: string) {
    return this.db
      .prepare("SELECT * FROM appointments WHERE owner=? AND request_id=?")
      .bind(owner, id)
      .first<Appointment>();
  }
  async cancel(owner: string, id: string) {
    const found = await this.db
      .prepare("SELECT id FROM appointments WHERE owner=? AND id=?")
      .bind(owner, id)
      .first();
    if (!found) throw new AppError("Appointment not found.", 404);
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE appointments SET status='cancelled' WHERE owner=? AND id=?",
        )
        .bind(owner, id),
      this.db
        .prepare(
          "DELETE FROM occupied_slots WHERE owner=? AND appointment_id=?",
        )
        .bind(owner, id),
    ]);
    return { status: "cancelled" };
  }
}
