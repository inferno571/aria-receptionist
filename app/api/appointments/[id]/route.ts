import { owner, store, json, failure } from "@/lib/server";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const who = await owner(request);
    const { id } = await context.params;
    return json(await store().cancel(who, id));
  } catch (e) {
    return failure(e);
  }
}
