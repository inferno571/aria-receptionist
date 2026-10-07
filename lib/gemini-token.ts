import { GoogleGenAI } from "@google/genai";
import type { LiveConnectConfig } from "@google/genai";
import { MODEL } from "./domain.ts";

// Lock whole repeated fields, not SDK-generated indexed paths such as tools.0.
// Session resumption is deliberately supplied by the browser on reconnect.
export const TOKEN_FIELD_MASK =
  "model,generationConfig,systemInstruction,tools,inputAudioTranscription,outputAudioTranscription,contextWindowCompression,realtimeInputConfig";
export async function mintVoiceToken(
  key: string,
  config: LiveConnectConfig,
  permitUntil: string,
) {
  const constraints = { ...config };
  delete constraints.sessionResumption;
  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { apiVersion: "v1beta", timeout: 20000 },
  });
  const result = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: permitUntil,
      newSessionExpireTime: new Date(Date.now() + 60000).toISOString(),
      liveConnectConstraints: { model: MODEL, config: constraints },
      lockAdditionalFields: [],
      httpOptions: { extraBody: { fieldMask: TOKEN_FIELD_MASK } },
      abortSignal: AbortSignal.timeout(20000),
    },
  });
  if (!result.name) throw new Error("Token was not returned");
  return result.name;
}
