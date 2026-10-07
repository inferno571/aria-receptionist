import { env } from "cloudflare:workers";
import { owner, store, json, failure, body } from "@/lib/server";
import { MODEL } from "@/lib/domain";
import { liveConfig } from "@/lib/gemini-config";
import { mintVoiceToken } from "@/lib/gemini-token";
import { selectVoiceKey, voiceError } from "@/lib/voice-policy";
import { CallStore } from "@/lib/call-store";

export async function POST(request: Request) {
  try {
    const who = await owner(request),
      input = await body(request);
    const { key, keySource } = selectVoiceKey(input.apiKey, env.GEMINI_API_KEY);
    const s = store(),
      calls = new CallStore(s.db);
    const config = liveConfig(await s.business(who));
    const call = await calls.reserve(who, keySource);
    try {
      const token = await mintVoiceToken(key, config, call.permitUntil);
      await calls.issued(who, call.id);
      return json({
        token,
        config,
        model: MODEL,
        callId: call.id,
        expiresAt: call.expiresAt,
        keySource,
      });
    } catch (error) {
      const mapped = voiceError(error);
      // Keep uncertain issuance reserved until expiry; a timed-out token may exist.
      await calls.failed(
        who,
        call.id,
        mapped.status === 403 || mapped.status === 429,
      );
      throw mapped;
    }
  } catch (error) {
    return failure(error);
  }
}
