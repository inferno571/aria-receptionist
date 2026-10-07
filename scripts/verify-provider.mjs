import { GoogleGenAI } from "@google/genai";

// Read a key from hidden stdin, never from command arguments or source files.
process.stdin.setRawMode?.(true);
process.stderr.write("Ready for Gemini API key on hidden stdin.\n");
const key = await new Promise((resolve) => {
  let text = "";
  const read = (chunk) => {
    text += chunk;
    if (/[\r\n]/.test(text)) {
      process.stdin.off("data", read);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve(text.trim());
    }
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", read);
  process.stdin.resume();
});
const base = "http://127.0.0.1:5173";
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
async function api(path, data, method = "POST") {
  const r = await fetch(base + path, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${value.error}`);
  return value;
}
let auth, session;
try {
  auth = await api("/api/live-token", { apiKey: key });
  let audioChunks = 0,
    toolCalls = 0;
  const client = new GoogleGenAI({
    apiKey: auth.token,
    httpOptions: { apiVersion: "v1beta" },
  });
  let done, fail;
  const completed = new Promise((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  const timeout = setTimeout(
    () => fail(new Error("Provider response timed out")),
    35000,
  );
  session = await client.live.connect({
    model: auth.model,
    config: auth.config,
    callbacks: {
      onmessage: async (message) => {
        if (message.serverContent?.modelTurn?.parts)
          audioChunks += message.serverContent.modelTurn.parts.filter(
            (p) => p.inlineData?.data,
          ).length;
        for (const call of message.toolCall?.functionCalls ?? []) {
          try {
            toolCalls++;
            const result = await api("/api/tools", {
              callId: auth.callId,
              toolCallId: call.id,
              name: call.name,
              args: call.args ?? {},
            });
            session.sendToolResponse({
              functionResponses: [
                { id: call.id, name: call.name, response: result },
              ],
            });
          } catch {
            fail(new Error("Tool execution failed"));
          }
        }
        if (message.serverContent?.turnComplete && toolCalls > 0) done();
      },
      onerror: () => fail(new Error("Provider WebSocket failed")),
      onclose: (event) => {
        if (event.code !== 1000)
          fail(new Error("Provider closed the connection"));
      },
    },
  });
  session.sendClientContent({
    turns: [
      {
        role: "user",
        parts: [
          {
            text: "This is a synthetic integration check. Please check available haircut appointments with Mira tomorrow morning and tell me the first available time. Do not book anything.",
          },
        ],
      },
    ],
    turnComplete: true,
  });
  await completed;
  clearTimeout(timeout);
  if (!audioChunks) throw new Error("No audio received");
  console.log(
    JSON.stringify({
      tokenIssued: true,
      keySource: auth.keySource,
      model: auth.model,
      audioChunks,
      toolCalls,
      realProviderCheck: "passed",
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      realProviderCheck: "failed",
      message: String(error.message).replaceAll(String(key), "[redacted]"),
    }),
  );
  process.exitCode = 1;
} finally {
  session?.close();
  if (auth)
    await api(
      "/api/calls",
      {
        id: auth.callId,
        status: "completed",
        duration: 1,
        transcript: [
          {
            role: "system",
            text: "Synthetic provider connection check.",
            time: new Date().toISOString(),
          },
        ],
      },
      "PUT",
    ).catch(() => {});
}
