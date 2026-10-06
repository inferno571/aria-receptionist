import { env } from "cloudflare:workers";
import { GoogleGenAI } from "@google/genai";
import { owner, store, json, failure, body } from "@/lib/server";
import { AppError, MODEL } from "@/lib/domain";
import { liveConfig } from "@/lib/gemini-config";
export async function POST(request: Request) {
  try {
    const id = await owner(request);
    const input = await body(request);
    const key =
      env.GEMINI_API_KEY ||
      (typeof input.apiKey === "string" ? input.apiKey.trim() : "");
    if (!key)
      throw new AppError(
        "Add your Gemini API key in Settings to start a live conversation.",
        428,
      );
    if (key.length > 256 || key.length < 20)
      throw new AppError(
        "That API key does not look valid. Check your Google AI Studio key.",
      );
    const config = liveConfig(await store().business(id));
    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: { apiVersion: "v1beta" },
      });
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(Date.now() + 15 * 60000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60000).toISOString(),
          liveConnectConstraints: { model: MODEL, config },
        },
      });
      if (!token.name) throw new Error("Missing token");
      return json({ token: token.name, model: MODEL, config });
    } catch (e) {
      const raw = String(e);
      const code = /429|RESOURCE_EXHAUSTED/.test(raw)
        ? 429
        : /401|403|API_KEY_INVALID|API key not valid/.test(raw)
          ? 403
          : 502;
      throw new AppError(
        code === 429
          ? "Gemini's free-tier limit has been reached. Wait and try again; Aria will not switch to a paid model."
          : code === 403
            ? "Gemini rejected this API key. Check the key and your access in Google AI Studio."
            : "Gemini couldn't start this voice session. Check model availability for your account and try again.",
        code,
      );
    }
  } catch (e) {
    return failure(e);
  }
}
