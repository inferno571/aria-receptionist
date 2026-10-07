import { GoogleGenAI } from "@google/genai";
import type {
  Session,
  LiveServerMessage,
  LiveConnectConfig,
} from "@google/genai";
import { AudioOutput, pcmToBase64 } from "./audio.ts";
import type { TranscriptLine } from "./domain";
import { appendTranscript } from "./transcript.ts";
export type LiveState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "reconnecting";
type Handlers = {
  onState: (s: LiveState) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  onError: (message: string) => void;
  onLevel: (n: number) => void;
  onAction: (text: string) => void;
  onSaved: () => void;
  onDuration: (n: number) => void;
};
async function api<T = unknown>(
  path: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
export class LiveReceptionist {
  handlers: Handlers;
  session?: Session;
  stream?: MediaStream;
  input?: AudioContext;
  output?: AudioOutput;
  worklet?: AudioWorkletNode;
  source?: MediaStreamAudioSourceNode;
  running = false;
  muted = false;
  callId = "";
  started = 0;
  transcript: TranscriptLine[] = [];
  outcome = "Conversation";
  resumption = "";
  token = "";
  config?: LiveConnectConfig;
  model = "";
  reconnecting = false;
  timer?: ReturnType<typeof setInterval>;
  maxTimer?: ReturnType<typeof setTimeout>;
  cancelled = new Set<string>();
  pending = new Map<string, AbortController>();
  toolResults = new Map<string, unknown>();
  segmentStart = true;
  connectionGeneration = 0;
  saveQueue: Promise<void> = Promise.resolve();
  stopping?: Promise<void>;
  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }
  deferredResponses = new Map<
    string,
    { id: string; name: string; response: Record<string, unknown> }
  >();
  flushResponses() {
    if (!this.running || this.reconnecting || !this.session) return;
    for (const [id, response] of this.deferredResponses) {
      if (this.cancelled.has(id)) {
        this.deferredResponses.delete(id);
        continue;
      }
      try {
        this.session.sendToolResponse({ functionResponses: [response] });
        this.deferredResponses.delete(id);
      } catch {
        this.handlers.onError(
          "The voice connection could not receive an action result. Your saved appointments remain available in the calendar.",
        );
        break;
      }
    }
  }
  async start(apiKey: string) {
    if (this.running) return;
    this.running = true;
    this.started = Date.now();
    this.handlers.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access requires HTTPS or localhost in a supported browser.",
        );
      this.input = new AudioContext({ sampleRate: 16000 });
      this.output = new AudioOutput(new AudioContext({ sampleRate: 24000 }));
      await Promise.all([this.input.resume(), this.output.context.resume()]);
      if (!this.running) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!this.running) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const auth = await api<{
        token: string;
        config: LiveConnectConfig;
        model: string;
        callId: string;
        expiresAt: string;
      }>("/api/live-token", { apiKey });
      this.callId = auth.callId;
      if (!this.running) {
        await this.save("completed");
        return;
      }
      this.token = auth.token;
      this.config = auth.config;
      this.model = auth.model;
      await this.connect(false);
      if (!this.running) return;
      await this.input.audioWorklet.addModule("/pcm-capture.js");
      if (!this.running) return;
      this.worklet = new AudioWorkletNode(this.input, "pcm-capture");
      this.source = this.input.createMediaStreamSource(this.stream);
      this.source.connect(this.worklet);
      const silent = this.input.createGain();
      silent.gain.value = 0;
      this.worklet.connect(silent);
      silent.connect(this.input.destination);
      let levelAt = 0;
      this.worklet.port.onmessage = (
        event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>,
      ) => {
        if (!this.running || this.muted || this.reconnecting) return;
        try {
          this.session?.sendRealtimeInput({
            audio: {
              data: pcmToBase64(event.data.pcm),
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch {}
        if (Date.now() - levelAt > 100) {
          this.handlers.onLevel(event.data.rms);
          levelAt = Date.now();
        }
      };
      this.timer = setInterval(() => {
        this.handlers.onDuration(
          Math.floor((Date.now() - this.started) / 1000),
        );
        if (Math.floor((Date.now() - this.started) / 1000) % 15 === 0)
          void this.save("active");
      }, 1000);
      this.maxTimer = setTimeout(
        () => {
          this.line(
            "system",
            "This session has reached its 12-minute limit. Start another conversation to continue.",
          );
          void this.stop();
        },
        Math.max(0, Date.parse(auth.expiresAt) - Date.now()),
      );
      this.handlers.onState("listening");
    } catch (e) {
      if (this.running) {
        this.handlers.onError(
          e instanceof Error ? e.message : "Unable to start the microphone.",
        );
        await this.stop("error");
      }
    }
  }
  async connect(resume: boolean) {
    const generation = ++this.connectionGeneration;
    const ai = new GoogleGenAI({
      apiKey: this.token,
      httpOptions: { apiVersion: "v1beta" },
    });
    this.reconnecting = resume;
    const session = await ai.live.connect({
      model: this.model,
      config: {
        ...this.config,
        sessionResumption: resume ? { handle: this.resumption } : {},
      },
      callbacks: {
        onmessage: (m) => {
          if (generation === this.connectionGeneration) void this.message(m);
        },
        onerror: () => {
          if (
            generation === this.connectionGeneration &&
            this.running &&
            !this.reconnecting
          ) {
            this.handlers.onError(
              "The voice connection encountered an error. End the call and try again.",
            );
            void this.stop("error");
          }
        },
        onclose: () => {
          if (
            generation === this.connectionGeneration &&
            this.running &&
            !this.reconnecting
          ) {
            this.line(
              "system",
              "The voice connection closed. Any confirmed appointments remain saved.",
            );
            void this.stop();
          }
        },
      },
    });
    if (!this.running || generation !== this.connectionGeneration) {
      session.close();
      return;
    }
    this.session = session;
    this.reconnecting = false;
    this.flushResponses();
    this.handlers.onState("listening");
  }
  line(role: TranscriptLine["role"], text: string) {
    if (!text) return;
    this.transcript = appendTranscript(
      this.transcript,
      role,
      text,
      this.segmentStart,
    );
    this.segmentStart = false;
    this.handlers.onTranscript(this.transcript.map((x) => ({ ...x })));
  }
  async message(message: LiveServerMessage) {
    if (!this.running) return;
    const content = message.serverContent;
    if (content?.interrupted) {
      this.output?.interrupt();
      this.segmentStart = true;
      this.handlers.onState("listening");
    }
    if (content?.inputTranscription?.text)
      this.line("user", content.inputTranscription.text);
    if (content?.outputTranscription?.text)
      this.line("assistant", content.outputTranscription.text);
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        this.handlers.onState("speaking");
        void this.output?.enqueue(part.inlineData.data).catch(() => {
          this.handlers.onError(
            "An audio chunk could not be played. Please restart the call if this continues.",
          );
        });
      }
    }
    if (content?.turnComplete) {
      this.segmentStart = true;
      const wait = Math.max(
        0,
        (this.output?.next ?? 0) - (this.output?.context.currentTime ?? 0),
      );
      setTimeout(() => {
        if (this.running) this.handlers.onState("listening");
      }, wait * 1000);
    }
    if (
      message.sessionResumptionUpdate?.resumable &&
      message.sessionResumptionUpdate.newHandle
    )
      this.resumption = message.sessionResumptionUpdate.newHandle;
    for (const id of message.toolCallCancellation?.ids ?? []) {
      this.cancelled.add(id);
      this.pending.get(id)?.abort();
      this.pending.delete(id);
      this.line(
        "system",
        "Action interrupted. Checking your saved appointments.",
      );
      this.handlers.onSaved();
    }
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (!call.id || !call.name) continue;
      void this.tool(call.id, call.name, call.args ?? {});
    }
    if (message.goAway && this.resumption && !this.reconnecting) {
      this.handlers.onState("reconnecting");
      this.reconnecting = true;
      this.session?.close();
      try {
        await this.connect(true);
      } catch {
        this.handlers.onError(
          "The session could not reconnect. Your bookings are safe; start a new call.",
        );
        await this.stop("error");
      }
    }
  }
  async tool(id: string, name: string, args: Record<string, unknown>) {
    if (this.cancelled.has(id) || this.pending.has(id)) return;
    const controller = new AbortController();
    this.pending.set(id, controller);
    this.handlers.onAction(
      name === "check_availability"
        ? "Checking available appointments…"
        : name === "create_booking"
          ? "Saving your appointment…"
          : name === "request_human"
            ? "Recording a follow-up request…"
            : "Checking booking status…",
    );
    let result: Record<string, unknown>;
    try {
      if (this.toolResults.has(id))
        result = this.toolResults.get(id) as Record<string, unknown>;
      else {
        const response = await fetch("/api/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
          body: JSON.stringify({
            callId: this.callId,
            toolCallId: id,
            name,
            args,
          }),
        });
        result = await response.json();
        if (!response.ok)
          result = {
            status: "error",
            retryable: response.status >= 500,
            message: result.error,
          };
        this.toolResults.set(id, result);
      }
      if (result.status === "confirmed") this.outcome = "Appointment booked";
      if (result.status === "follow_up_requested")
        this.outcome = `Follow-up: ${String(args.reason).slice(0, 95)}`;
      if (!this.cancelled.has(id) && this.running) {
        this.deferredResponses.set(id, { id, name, response: result });
        this.flushResponses();
        this.line(
          "system",
          result.status === "confirmed"
            ? `Appointment confirmed · ${result.reference}`
            : result.status === "error"
              ? String(result.message)
              : name === "check_availability"
                ? "Availability checked"
                : String(result.message ?? "Action completed"),
        );
      }
      this.handlers.onSaved();
    } catch {
      if (!this.cancelled.has(id) && this.running) {
        this.deferredResponses.set(id, {
          id,
          name,
          response: {
            status: "error",
            retryable: true,
            message:
              "Connection interrupted. Before retrying a booking, call check_booking_status with requestId " +
              this.callId +
              ":" +
              id,
          },
        });
        this.flushResponses();
      }
    } finally {
      this.pending.delete(id);
      this.handlers.onAction("");
    }
  }
  mute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
      this.handlers.onLevel(0);
    }
    return this.muted;
  }
  save(status: string) {
    if (!this.callId) return Promise.resolve();
    const payload = {
      id: this.callId,
      status,
      duration: Math.floor((Date.now() - this.started) / 1000),
      transcript: this.transcript.map((x) => ({ ...x })),
      outcome: this.outcome,
    };
    this.saveQueue = this.saveQueue.then(async () => {
      try {
        await api("/api/calls", payload, "PUT");
      } catch {
        this.handlers.onError(
          "Your call transcript could not be saved. Confirmed appointments are stored separately.",
        );
      }
    });
    return this.saveQueue;
  }
  stop(status = "completed") {
    if (!this.stopping) this.stopping = this.finish(status);
    return this.stopping;
  }
  private async finish(status: string) {
    this.running = false;
    this.connectionGeneration++;
    clearInterval(this.timer);
    clearTimeout(this.maxTimer);
    this.session?.close();
    this.output?.interrupt();
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    if (this.input?.state !== "closed") await this.input?.close();
    if (this.output?.context.state !== "closed")
      await this.output?.context.close();
    this.handlers.onLevel(0);
    this.handlers.onState("idle");
    await this.save(status);
    this.handlers.onSaved();
  }
}
