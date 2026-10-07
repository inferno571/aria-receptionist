import { AppError } from "./domain.ts";

export const CALL_SECONDS = 12 * 60;
export const TOKEN_SECONDS = 15 * 60;
export type KeySource = "personal" | "shared";
export function selectVoiceKey(
  personal: unknown,
  fallback: string | undefined,
) {
  if (personal !== undefined && typeof personal !== "string")
    throw new AppError("The API key must be text.");
  const own = typeof personal === "string" ? personal.trim() : "";
  const key = own || fallback?.trim() || "";
  if (!key)
    throw new AppError(
      "Add a Gemini API key in Settings to start a conversation.",
      428,
    );
  if (key.length < 20 || key.length > 256)
    throw new AppError("Check your Google AI Studio API key.");
  return { key, keySource: (own ? "personal" : "shared") as KeySource };
}
export function voiceError(error: unknown) {
  const raw = String(error);
  const code = /429|RESOURCE_EXHAUSTED/.test(raw)
    ? 429
    : /401|403|API_KEY_INVALID|API key not valid/.test(raw)
      ? 403
      : 502;
  return new AppError(
    code === 429
      ? "Gemini quota is currently exhausted. Try later or use a different key in Settings."
      : code === 403
        ? "Gemini rejected the API key. Check its status, API restrictions and model access in Google AI Studio."
        : "Gemini could not start this session. Check model access and try again.",
    code,
  );
}
