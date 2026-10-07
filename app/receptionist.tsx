"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Headphones,
  KeyRound,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  LoaderCircle,
  AlertCircle,
  X,
  History,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  DEFAULT_BUSINESS,
  SERVICES,
  STAFF,
  salonDate,
  datePlus,
  displayDate,
  displayTime,
  minuteTime,
} from "@/lib/domain";
import type {
  Appointment,
  Business,
  CallRecord,
  TranscriptLine,
} from "@/lib/domain";
import { LiveReceptionist } from "@/lib/live-client";
import type { LiveState } from "@/lib/live-client";

type Dashboard = {
  appointments: Appointment[];
  calls: CallRecord[];
  business: Business;
  hasServerKey: boolean;
  nextCursor: string | null;
};
async function request<T = unknown>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch(
    path,
    data !== undefined
      ? {
          method: method ?? "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  );
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}
function Choice({
  value,
  onChange,
  label,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="form-field">
      <label className="field-label">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="form-select" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function duration(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function Receptionist() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [hasServerKey, setHasServerKey] = useState(false);
  const [business, setBusiness] = useState<Business>(DEFAULT_BUSINESS);
  const [draft, setDraft] = useState<Business>(DEFAULT_BUSINESS);
  const [saving, setSaving] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteCallId, setDeleteCallId] = useState<string | null>(null);
  const [deletingCall, setDeletingCall] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<LiveState>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [action, setAction] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [tab, setTab] = useState("live");
  const [viewing, setViewing] = useState<CallRecord | null>(null);
  const client = useRef<LiveReceptionist | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const active = state !== "idle";
  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    serviceId: "haircut",
    staffId: "mira",
    date: datePlus(1),
    time: "",
  });
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const requestId = useRef("");
  const refresh = useCallback(
    () =>
      request<Dashboard>("/api/dashboard")
        .then((d) => {
          setAppointments(d.appointments);
          setCalls(d.calls);
          setHistoryCursor(d.nextCursor);
          setBusiness(d.business);
          setHasServerKey(d.hasServerKey);
          setLoadError("");
        })
        .catch((e) => {
          setLoadError((e as Error).message);
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );
  useEffect(() => {
    void refresh();
    return () => {
      void client.current?.stop();
    };
  }, [refresh]);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [lines, action]);
  useEffect(() => {
    if (!bookingOpen) return;
    let disposed = false;
    request<{ slots: { time: string }[] }>(
      `/api/availability?date=${encodeURIComponent(form.date)}&serviceId=${form.serviceId}&staffId=${form.staffId}`,
    )
      .then((d) => {
        if (!disposed) setSlots(d.slots.map((x: { time: string }) => x.time));
      })
      .catch((e) => {
        if (!disposed) {
          setBookingError(e.message);
          setSlots([]);
        }
      })
      .finally(() => {
        if (!disposed) setSlotsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [bookingOpen, form.date, form.serviceId, form.staffId]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "list_receptionist_appointments",
          title: "List appointments",
          description:
            "Read the current owner's upcoming appointments. Does not create or change bookings.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw new Error("Expected an empty object.");
            const d = await request<Dashboard>("/api/dashboard");
            setAppointments(d.appointments);
            return {
              appointments: d.appointments.map((a: Appointment) => ({
                id: a.id,
                date: a.date,
                time: minuteTime(a.start_minute),
                service: a.service_id,
                staff: a.staff_id,
                status: a.status,
              })),
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, []);
  function openSettings() {
    setDraft(business);
    setSettingsOpen(true);
  }
  async function moreHistory() {
    if (!historyCursor || historyLoading) return;
    setHistoryLoading(true);
    try {
      const d = await request<{
        calls: CallRecord[];
        nextCursor: string | null;
      }>(`/api/calls?before=${encodeURIComponent(historyCursor)}`);
      setCalls((c) => [
        ...c,
        ...d.calls.filter((item) => !c.some((old) => old.id === item.id)),
      ]);
      setHistoryCursor(d.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  async function deleteHistory() {
    if (!deleteCallId) return;
    setDeletingCall(true);
    try {
      await request(`/api/calls/${deleteCallId}`, {}, "DELETE");
      setViewing(null);
      setDeleteCallId(null);
      await refresh();
      setTab("history");
      toast.success("Call transcript deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingCall(false);
    }
  }
  async function saveSettings() {
    setSaving(true);
    try {
      const next = await request<Business>("/api/settings", draft, "PUT");
      setBusiness(next);
      setSettingsOpen(false);
      toast.success("Receptionist settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function start() {
    if (active) return;
    if (!apiKey.trim() && !hasServerKey) {
      openSettings();
      return;
    }
    setVoiceError("");
    setLines([]);
    setViewing(null);
    setTab("live");
    setSeconds(0);
    setMuted(false);
    setAction("");
    const live = new LiveReceptionist({
      onState: setState,
      onTranscript: setLines,
      onError: setVoiceError,
      onLevel: setLevel,
      onAction: setAction,
      onSaved: () => void refresh(),
      onDuration: setSeconds,
    });
    client.current = live;
    await live.start(apiKey.trim());
  }
  function openBooking() {
    setSlotsLoading(true);
    requestId.current = crypto.randomUUID();
    setForm({
      customerName: "",
      phone: "",
      serviceId: "haircut",
      staffId: "mira",
      date: datePlus(1),
      time: "",
    });
    setBookingError("");
    setBookingOpen(true);
  }
  function change(key: keyof typeof form, value: string) {
    if (["date", "serviceId", "staffId"].includes(key) && form[key] !== value) {
      setSlotsLoading(true);
      setBookingError("");
    }
    requestId.current = crypto.randomUUID();
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(["date", "serviceId", "staffId"].includes(key) ? { time: "" } : {}),
    }));
  }
  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!form.time) return;
    setBookingBusy(true);
    setBookingError("");
    try {
      const result = await request<{ appointment: Appointment }>(
        "/api/appointments",
        { ...form, requestId: requestId.current, confirmed: true },
      );
      setBookingOpen(false);
      toast.success(
        `Appointment confirmed · ${result.appointment.id.slice(0, 8).toUpperCase()}`,
      );
      await refresh();
    } catch (e) {
      setBookingError((e as Error).message);
    } finally {
      setBookingBusy(false);
    }
  }
  async function cancel() {
    if (!cancelId) return;
    setBusyCancel(true);
    try {
      await request(`/api/appointments/${cancelId}`, {}, "DELETE");
      toast.success("Appointment cancelled. The time is available again.");
      setCancelId(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyCancel(false);
    }
  }
  const statusText =
    state === "connecting"
      ? "Connecting…"
      : state === "reconnecting"
        ? "Reconnecting…"
        : muted
          ? "Microphone muted"
          : state === "speaking"
            ? "Aria is speaking"
            : active
              ? "Aria is listening"
              : "Ready when you are";
  const historyLines: TranscriptLine[] = viewing
    ? JSON.parse(viewing.transcript)
    : [];
  const visibleLines = viewing ? historyLines : lines;
  return (
    <SidebarProvider className="aria-shell">
      <Toaster theme="light" position="bottom-right" />
      <Sidebar collapsible="none" className="aria-sidebar">
        <SidebarHeader>
          <Link className="wordmark" href="/">
            <span className="brand-mark">
              <AudioLines size={23} />
            </span>
            aria<span className="brand-dot">.</span>
          </Link>
        </SidebarHeader>
        <div className="workspace">
          <span className="workspace-avatar">{business.name.charAt(0)}</span>
          <div>
            <strong>{business.name}</strong>
            <small>Your reception desk</small>
          </div>
        </div>
        <SidebarContent>
          <p className="nav-label">WORKSPACE</p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive
                className="nav-item"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <Headphones />
                Receptionist
                <span className="tiny-dot" />
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                onClick={() =>
                  document
                    .getElementById("appointments")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <CalendarDays />
                Appointments
                <span className="nav-count">
                  {appointments.filter((a) => a.status === "confirmed").length}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="nav-item"
                onClick={() => {
                  setTab("history");
                  document
                    .getElementById("conversation")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <History />
                Call history
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton className="nav-item" onClick={openSettings}>
                <Settings2 />
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="side-note">
            <Sparkles size={19} />
            <strong>A little more human.</strong>
            <p>A welcoming first hello, even when your hands are full.</p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-bottom">
            <span className="avatar">SS</span>
            <div>
              <strong>Studio workspace</strong>
              <small>Private workspace</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <span>Receptionist</span>
          </div>
          <button className="quiet-button" onClick={openSettings}>
            <Settings2 size={16} />
            Configure assistant
          </button>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR AI FRONT DESK</p>
              <h1>Your reception desk.</h1>
              <p>
                Take calls, manage appointments, and follow up in one place.
              </p>
            </div>
            <span className="outline-badge">
              <span className="status-dot" />
              Gemini 3.8 Live
            </span>
          </div>
          {loadError && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{loadError}</span>
              <button onClick={() => void refresh()}>
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          )}
          <div className="main-grid">
            <section className={`voice-card ${active ? "voice-active" : ""}`}>
              <div className="card-top">
                <span className="label-with-icon">
                  <AudioLines size={17} />
                  Meet your receptionist
                </span>
                <span className="soft-badge">
                  {active ? duration(seconds) : "LIVE VOICE"}
                </span>
              </div>
              <div className="orb-wrap">
                <div className="orb-ring ring-one" />
                <div className="orb-ring ring-two" />
                <div
                  className="voice-orb"
                  style={{
                    transform: `scale(${1 + Math.min(level * 2, 0.18)})`,
                  }}
                >
                  <AudioLines strokeWidth={1.4} size={64} />
                </div>
                <span className="orb-spark spark-one" />
                <span className="orb-spark spark-two" />
              </div>
              <h2>
                {active ? (
                  <>
                    A little less waiting.
                    <br />A little more listening.
                  </>
                ) : (
                  <>
                    Good conversations
                    <br />
                    start with Aria.
                  </>
                )}
              </h2>
              <p className="voice-description">
                {active ? (
                  <>
                    Speak naturally, or interrupt to make a change.
                    <br />
                    {statusText}
                  </>
                ) : (
                  <>
                    Ask about a service, find a time,
                    <br />
                    or book your next appointment.
                  </>
                )}
              </p>
              {active ? (
                <div className="call-controls">
                  <button
                    className={`mute-button ${muted ? "is-muted" : ""}`}
                    aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                    aria-pressed={muted}
                    onClick={() => setMuted(client.current?.mute() ?? false)}
                  >
                    {muted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  <button
                    className="primary-button end-call"
                    onClick={() => void client.current?.stop()}
                  >
                    <PhoneOff size={18} />
                    End conversation
                  </button>
                </div>
              ) : (
                <button
                  className="primary-button call-button"
                  onClick={() => void start()}
                  disabled={loading || !!loadError}
                >
                  <Mic size={19} />
                  Start a conversation
                  <ArrowUpRight size={18} />
                </button>
              )}
              <p className="voice-footnote">
                <Headphones size={14} />
                {active
                  ? "You’re speaking with an AI receptionist"
                  : apiKey || hasServerKey
                    ? "Audio goes to Google. Your transcript is saved privately."
                    : "Add a Gemini key to start · free tier available"}
              </p>
              {voiceError && (
                <div className="voice-error" role="alert">
                  {voiceError}
                  <button
                    aria-label="Dismiss voice error"
                    onClick={() => setVoiceError("")}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className="voice-capabilities">
                <span>
                  <Check />
                  Natural conversation
                </span>
                <span>
                  <Check />
                  Live availability
                </span>
                <span>
                  <Check />
                  Real bookings
                </span>
              </div>
            </section>
            <section className="transcript-card" id="conversation">
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="conversation-tabs"
              >
                <div className="card-top">
                  <TabsList variant="line">
                    <TabsTrigger value="live">
                      <Phone size={14} />
                      Conversation
                    </TabsTrigger>
                    <TabsTrigger value="history">
                      <History size={14} />
                      History
                    </TabsTrigger>
                  </TabsList>
                  <span className="waiting-label">
                    <span className={active ? "live-dot" : ""} />
                    {active ? duration(seconds) : "Private"}
                  </span>
                </div>
                <TabsContent value="live" className="conversation-body">
                  {viewing && (
                    <div className="history-view-label">
                      <span>
                        {new Date(viewing.started_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <button onClick={() => setViewing(null)}>
                        Back to live
                      </button>
                      <button
                        disabled={viewing.status === "active"}
                        onClick={() => setDeleteCallId(viewing.id)}
                      >
                        Delete transcript
                      </button>
                    </div>
                  )}
                  {visibleLines.length ? (
                    <div className="transcript-lines" aria-live="polite">
                      {visibleLines.map((line, i) => (
                        <div key={i} className={`transcript-line ${line.role}`}>
                          <span className="speaker-name">
                            {line.role === "assistant"
                              ? "ARIA"
                              : line.role === "user"
                                ? "YOU"
                                : "RECEPTION DESK"}
                          </span>
                          <p>{line.text}</p>
                        </div>
                      ))}
                      {action && !viewing && (
                        <div className="tool-activity">
                          <LoaderCircle size={14} className="spin" />
                          {action}
                        </div>
                      )}
                      <div ref={transcriptEnd} />
                    </div>
                  ) : (
                    <div className="transcript-empty">
                      <div className="empty-icon">
                        <AudioLines size={28} />
                      </div>
                      <h3>A conversation, not a script.</h3>
                      <p>
                        Your live transcript will appear here.
                        <br />
                        Speak naturally. Change your mind.
                        <br />
                        Aria will keep up.
                      </p>
                      <div className="try-prompt">
                        <span>TRY SAYING</span>
                        <p>“I’d love a haircut tomorrow afternoon.”</p>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="history" className="history-list">
                  {calls.length ? (
                    calls.map((call) => (
                      <button
                        className="history-item"
                        key={call.id}
                        onClick={() => {
                          setViewing(call);
                          setTab("live");
                        }}
                      >
                        <span className="history-icon">
                          <Phone size={16} />
                        </span>
                        <div>
                          <strong>{call.outcome}</strong>
                          <span>
                            {new Date(call.started_at).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            · {duration(call.duration_seconds)}
                          </span>
                        </div>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <div className="transcript-empty">
                      <div className="empty-icon">
                        <History size={27} />
                      </div>
                      <h3>Your conversations, in one place.</h3>
                      <p>
                        Completed calls and follow-up requests
                        <br />
                        will appear here.
                      </p>
                    </div>
                  )}
                  {historyCursor && (
                    <button
                      className="quiet-button history-more"
                      disabled={historyLoading}
                      onClick={() => void moreHistory()}
                    >
                      {historyLoading ? "Loading…" : "Load older calls"}
                    </button>
                  )}
                </TabsContent>
              </Tabs>
              <div className="transcript-footer">
                <ShieldCheck size={15} />
                {active
                  ? "Audio goes to Gemini. Transcripts are saved privately."
                  : "Your microphone is off until you start a call."}
              </div>
            </section>
          </div>
          <div className="lower-grid">
            <section className="appointments-card" id="appointments">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ON THE CALENDAR</p>
                  <h2>Upcoming appointments</h2>
                </div>
                <button
                  className="quiet-button"
                  onClick={openBooking}
                  disabled={loading || !!loadError}
                >
                  <Plus size={16} />
                  Book appointment
                </button>
              </div>
              {loading ? (
                <div className="calendar-empty">
                  <LoaderCircle className="spin" size={22} />
                  <p>Loading your calendar…</p>
                </div>
              ) : appointments.length ? (
                <div className="appointment-list">
                  {appointments.map((a) => (
                    <div
                      className={`appointment-row ${a.status === "cancelled" ? "cancelled" : ""}`}
                      key={a.id}
                    >
                      <div className="appointment-date">
                        <strong>
                          {new Date(a.date + "T12:00:00Z").getUTCDate()}
                        </strong>
                        <span>
                          {new Date(a.date + "T12:00:00Z").toLocaleDateString(
                            "en",
                            { month: "short", timeZone: "UTC" },
                          )}
                        </span>
                      </div>
                      <div className="appointment-details">
                        <strong>{a.customer_name}</strong>
                        <p>
                          {SERVICES.find((s) => s.id === a.service_id)?.name} ·{" "}
                          {STAFF.find((s) => s.id === a.staff_id)?.name}
                        </p>
                        <span>
                          {displayTime(a.start_minute)} IST · {a.duration} min ·{" "}
                          {a.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <div className="appointment-actions">
                        <span className={`booking-badge ${a.status}`}>
                          {a.status === "confirmed" ? (
                            <Check size={11} />
                          ) : null}
                          {a.status}
                        </span>
                        {a.status === "confirmed" && (
                          <button
                            className="cancel-link"
                            onClick={() => setCancelId(a.id)}
                            aria-label={`Cancel appointment for ${a.customer_name}`}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="calendar-empty">
                  <CalendarDays size={27} />
                  <div>
                    <strong>Your next booking starts with a hello.</strong>
                    <p>Appointments confirmed with Aria will appear here.</p>
                  </div>
                </div>
              )}
            </section>
            <section className="services-card">
              <div className="section-heading">
                <h2>A little self-care</h2>
                <WandSparkles size={19} />
              </div>
              {SERVICES.map((x) => (
                <div className="service-row" key={x.id}>
                  <div>
                    <strong>{x.name}</strong>
                    <span>
                      <Clock3 size={12} />
                      {x.duration} min
                    </span>
                  </div>
                  <b>₹{x.price.toLocaleString("en-IN")}</b>
                </div>
              ))}
              <p className="service-hours">Open daily · 10 AM–7 PM IST</p>
            </section>
          </div>
          <footer className="page-footer">
            <span>
              <span className="mini-mark">a.</span>Thoughtful service, from the
              first hello.
            </span>
            <span>{business.address} · Asia/Kolkata</span>
            <a href="/signout-with-chatgpt?return_to=/">Sign out</a>
          </footer>
        </div>
      </main>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Your receptionist, your way.</DialogTitle>
            <DialogDescription>
              Connect Gemini and introduce Aria to your business.
            </DialogDescription>
          </DialogHeader>
          <div className="settings-scroll">
            <div className="connection-label">
              <KeyRound size={16} />
              <strong>Gemini connection</strong>
              <span className="soft-badge">
                {apiKey.trim()
                  ? "YOUR KEY"
                  : hasServerKey
                    ? "SHARED CONNECTION"
                    : "ADD A KEY"}
              </span>
            </div>
            <label className="field-label" htmlFor="gemini-key">
              Your Gemini API key (optional)
            </label>
            <input
              id="gemini-key"
              type="password"
              className="text-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                hasServerKey
                  ? "Leave blank to use the shared connection"
                  : "Paste your Gemini API key"
              }
              autoComplete="off"
            />
            <p className="field-help">
              Your key takes priority over the shared connection and clears on
              reload. It is never saved in browser storage or the database.
              Clear this field to return to the shared connection.
            </p>
            <a
              className="text-link"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get a key in Google AI Studio <ArrowUpRight size={14} />
            </a>
            <div className="settings-divider" />
            <label className="field-label" htmlFor="business-name">
              Business name
            </label>
            <input
              id="business-name"
              className="text-input"
              value={draft.name}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <label className="field-label" htmlFor="business-address">
              Location
            </label>
            <input
              id="business-address"
              className="text-input"
              value={draft.address}
              maxLength={160}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
            <label className="field-label" htmlFor="greeting">
              Opening greeting
            </label>
            <textarea
              id="greeting"
              className="text-input"
              rows={3}
              maxLength={300}
              value={draft.greeting}
              onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
            />
            <p className="field-help">
              Shared connection: up to 5 starts per user per day, subject to
              global capacity. Sessions last up to 12 minutes. Personal keys use
              your Google project&apos;s quota and billing settings. Model:
              gemini-3.8-live.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => void saveSettings()}
            disabled={saving || active}
          >
            {saving ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            Save settings
          </button>
          {active && (
            <p className="field-help">
              End the current call before changing the receptionist.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteCallId}
        onOpenChange={(open) => {
          if (!open && !deletingCall) setDeleteCallId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call transcript?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the transcript and follow-up note.
              Appointments remain in your calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCall}>
              Keep transcript
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingCall}
              onClick={(e) => {
                e.preventDefault();
                void deleteHistory();
              }}
            >
              Delete transcript
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={bookingOpen}
        onOpenChange={(open) => {
          if (!bookingBusy) setBookingOpen(open);
        }}
      >
        <DialogContent className="booking-dialog">
          <DialogHeader>
            <DialogTitle>Make a little time for yourself.</DialogTitle>
            <DialogDescription>
              Choose a service and an available time. All times are in IST.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={book} className="booking-form">
            <div className="form-columns">
              <Choice
                label="Service"
                value={form.serviceId}
                onChange={(v) => change("serviceId", v)}
                items={SERVICES.map((s) => ({
                  value: s.id,
                  label: `${s.name} · ${s.duration} min`,
                }))}
              />
              <Choice
                label="Stylist"
                value={form.staffId}
                onChange={(v) => change("staffId", v)}
                items={STAFF.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <label className="field-label" htmlFor="booking-date">
              Date
            </label>
            <input
              id="booking-date"
              type="date"
              className="text-input"
              min={salonDate()}
              max={datePlus(30)}
              value={form.date}
              onChange={(e) => change("date", e.target.value)}
              required
            />
            <div className="field-label">Available times</div>
            <div
              className="slot-grid"
              role="group"
              aria-label="Available appointment times"
            >
              {slotsLoading ? (
                <p className="field-help">Checking availability…</p>
              ) : slots.length ? (
                slots.map((time) => (
                  <button
                    type="button"
                    aria-pressed={form.time === time}
                    className={`time-slot ${form.time === time ? "selected" : ""}`}
                    key={time}
                    onClick={() => change("time", time)}
                  >
                    {displayTime(
                      Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
                    )}
                  </button>
                ))
              ) : (
                <p className="field-help">
                  No available times. Try another date or stylist.
                </p>
              )}
            </div>
            <div className="form-columns">
              <div className="form-field">
                <label className="field-label" htmlFor="customer-name">
                  Your name
                </label>
                <input
                  className="text-input"
                  id="customer-name"
                  value={form.customerName}
                  onChange={(e) => change("customerName", e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor="customer-phone">
                  Phone number
                </label>
                <input
                  className="text-input"
                  id="customer-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => change("phone", e.target.value)}
                  required
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </div>
            </div>
            {form.time && (
              <div className="booking-summary">
                <CheckCircle2 size={17} />
                <span>
                  {displayDate(form.date)} ·{" "}
                  {displayTime(
                    Number(form.time.slice(0, 2)) * 60 +
                      Number(form.time.slice(3)),
                  )}{" "}
                  IST · ₹
                  {SERVICES.find(
                    (s) => s.id === form.serviceId,
                  )?.price.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {bookingError && (
              <p className="form-error" role="alert">
                {bookingError}
              </p>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={bookingBusy || !form.time || slotsLoading}
            >
              {bookingBusy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <CalendarDays size={17} />
              )}
              Confirm appointment
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!cancelId}
        onOpenChange={(open) => {
          if (!open && !busyCancel) setCancelId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              The time will become available for other clients. You can make a
              new booking afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyCancel}>
              Keep appointment
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busyCancel}
              onClick={(e) => {
                e.preventDefault();
                void cancel();
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
