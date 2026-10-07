import { owner, store, json, failure, body } from "@/lib/server";
import { AppError } from "@/lib/domain";
import { CallStore } from "@/lib/call-store";
import type { BookingInput } from "@/lib/booking";
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
    await new CallStore(s.db).assertActive(who, input.callId);
    if (
      !input.args ||
      typeof input.args !== "object" ||
      Array.isArray(input.args)
    )
      throw new AppError("Invalid tool arguments.");
    const args = input.args as Record<string, unknown>;
    if (input.name === "check_availability")
      return json({
        status: "ok",
        retryable: false,
        ...(await s.availability(
          who,
          args.date as string,
          args.serviceId as string,
          args.staffId as string | undefined,
        )),
      });
    if (input.name === "create_booking") {
      const appointment = await s.book(who, {
        ...args,
        requestId: `${input.callId}:${input.toolCallId}`,
        source: "voice",
      } as BookingInput);
      await new CallStore(s.db).noteBooking(who, input.callId);
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
      await new CallStore(s.db).requestFollowUp(who, input.callId, args.reason);
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
