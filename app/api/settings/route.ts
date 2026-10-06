import { owner, store, json, failure, body } from "@/lib/server";
import { AppError } from "@/lib/domain";
export async function PUT(request: Request) {
  try {
    const id = await owner(request);
    const x = await body(request);
    for (const [key, max] of [
      ["name", 80],
      ["address", 160],
      ["greeting", 300],
    ] as const) {
      if (typeof x[key] !== "string" || !x[key].trim() || x[key].length > max)
        throw new AppError(
          `Please enter a valid ${key} (maximum ${max} characters).`,
        );
    }
    const value = {
      name: x.name.trim(),
      address: x.address.trim(),
      greeting: x.greeting.trim(),
    };
    await store()
      .db.prepare(
        "INSERT INTO settings(owner,value) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value",
      )
      .bind(id, JSON.stringify(value))
      .run();
    return json(value);
  } catch (e) {
    return failure(e);
  }
}
