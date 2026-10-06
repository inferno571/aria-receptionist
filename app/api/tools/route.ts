import { owner, store, json, failure, body } from "@/lib/server";
import { AppError } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    const who = await owner(request);
    const input = await body(request);
    const s = store();
    if (
      typeof input.callId !== "string" ||
      typeof input.toolCallId !== "string" ||
      input.toolCallId.length > 100
    )
      throw new AppError("Invalid tool request.");
    const call = await s.db
      .prepare(
        "SELECT id FROM calls WHERE id=? AND owner=? AND status='active'",
      )
      .bind(input.callId, who)
      .first();
    if (!call)
      throw new AppError("This call has ended. Start a new conversation.", 409);
    const args = input.args;
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new AppError("Invalid tool arguments.");
    if (input.name === "check_availability")
      return json({
        status: "ok",
        retryable: false,
        ...(await s.availability(who, args.date, args.serviceId, args.staffId)),
      });
    if (input.name === "create_booking") {
      const appointment = await s.book(who, {
        ...args,
        requestId: `${input.callId}:${input.toolCallId}`,
        source: "voice",
      });
      await s.db
        .prepare(
          "UPDATE calls SET outcome=CASE WHEN outcome LIKE 'Follow-up:%' THEN outcome ELSE 'Appointment booked' END WHERE id=? AND owner=?",
        )
        .bind(input.callId, who)
        .run();
      return json({
        status: appointment.status,
        retryable: false,
        reference: appointment.id.slice(0, 8).toUpperCase(),
        requestId: appointment.request_id,
        date: appointment.date,
        time: args.time,
        serviceId: appointment.service_id,
        staffId: appointment.staff_id,
        message: "The appointment is saved. No SMS or email has been sent.",
      });
    }
    if (input.name === "check_booking_status") {
      if (
        typeof args.requestId !== "string" ||
        !args.requestId.startsWith(input.callId + ":")
      )
        throw new AppError(
          "Only this call's booking actions can be checked.",
          403,
        );
      const booking = await s.byRequest(who, args.requestId);
      return json({
        status: booking?.status ?? "not_found",
        reference: booking?.id.slice(0, 8).toUpperCase(),
        retryable: false,
      });
    }
    if (input.name === "request_human") {
      if (typeof args.reason !== "string" || !args.reason.trim())
        throw new AppError("Please provide a reason for the follow-up.");
      await s.db
        .prepare("UPDATE calls SET outcome=? WHERE id=? AND owner=?")
        .bind(`Follow-up: ${args.reason.slice(0, 95)}`, input.callId, who)
        .run();
      return json({
        status: "follow_up_requested",
        retryable: false,
        message:
          "A follow-up note has been saved in the owner's call history. This is not a live transfer.",
      });
    }
    throw new AppError("Unknown receptionist tool.");
  } catch (e) {
    return failure(e);
  }
}
