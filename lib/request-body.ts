import { AppError } from "./domain.ts";
export async function readJson(
  request: Request,
  limit = 300000,
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) throw new AppError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Send a JSON object.");
  let size = 0,
    text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("Request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Send valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new AppError("Send a valid JSON object.");
  }
}
