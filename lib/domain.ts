export const MODEL = "gemini-3.8-live";
export const TIME_ZONE = "Asia/Kolkata";
export const SERVICES = [
  { id: "haircut", name: "Haircut & finish", duration: 45, price: 800 },
  { id: "beard", name: "Beard trim", duration: 30, price: 400 },
  { id: "spa", name: "Hair spa", duration: 60, price: 1500 },
] as const;
export const STAFF = [
  { id: "mira", name: "Mira" },
  { id: "aarav", name: "Aarav" },
] as const;
export const DEFAULT_BUSINESS = {
  name: "Studio & Strand",
  address: "New Delhi, India",
  greeting:
    "Hi, I'm Aria, the AI receptionist at Studio & Strand. How can I help you today?",
};
export type Business = typeof DEFAULT_BUSINESS;
export type Appointment = {
  id: string;
  owner: string;
  request_id: string;
  payload: string;
  customer_name: string;
  phone: string;
  service_id: string;
  staff_id: string;
  date: string;
  start_minute: number;
  duration: number;
  status: "confirmed" | "cancelled";
  source: string;
  created_at: string;
};
export type TranscriptLine = {
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
};
export type CallRecord = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  duration_seconds: number;
  transcript: string;
  outcome: string;
};
export function salonDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function datePlus(days: number, from = salonDate()) {
  return new Date(Date.parse(from + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function minuteTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function displayTime(minute: number) {
  return `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${minute >= 720 ? "PM" : "AM"}`;
}
export function displayDate(date: string) {
  return new Date(date + "T12:00:00+05:30").toLocaleDateString("en-IN", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function validateDate(date: unknown, now = new Date()): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new AppError("Use a date in YYYY-MM-DD format.");
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new AppError("That calendar date does not exist.");
  if (date < salonDate(now) || date > datePlus(30, salonDate(now)))
    throw new AppError("Choose a date within the next 30 days.");
  return date;
}
export function serviceById(id: unknown) {
  const service = SERVICES.find((s) => s.id === id);
  if (!service) throw new AppError("Please choose one of our listed services.");
  return service;
}
export function staffById(id: unknown) {
  const staff = STAFF.find((s) => s.id === id);
  if (!staff) throw new AppError("Please choose Mira or Aarav.");
  return staff;
}
export function startMinute(time: unknown) {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new AppError("Use a valid time in HH:MM format.");
  const [h, m] = time.split(":").map(Number);
  if (m % 15) throw new AppError("Appointments start every 15 minutes.");
  return h * 60 + m;
}
export function isFutureSlot(date: string, minute: number, now = new Date()) {
  return Date.parse(`${date}T${minuteTime(minute)}:00+05:30`) > now.getTime();
}
export function slotMinutes(start: number, duration: number) {
  return Array.from({ length: duration / 15 }, (_, i) => start + i * 15);
}
