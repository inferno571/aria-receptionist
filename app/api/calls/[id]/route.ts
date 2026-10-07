import { owner, store, json, failure } from "@/lib/server";
import { CallStore } from "@/lib/call-store";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const who = await owner(request);
    await new CallStore(store().db).remove(who, (await context.params).id);
    return json({ deleted: true });
  } catch (error) {
    return failure(error);
  }
}
