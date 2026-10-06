import { owner, store, json, failure } from "@/lib/server";
export async function GET(request: Request) {
  try {
    const id = await owner(request);
    const p = new URL(request.url).searchParams;
    return json(
      await store().availability(
        id,
        p.get("date") ?? "",
        p.get("serviceId") ?? "",
        p.get("staffId") || undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
