# Aria — AI voice receptionist

[Live app](https://aria-voice-receptionist.inferno-sooden.chatgpt.site) · [Architecture](docs/architecture.md) · [Security](SECURITY.md)

Aria talks to customers, checks a salon's availability, and books confirmed appointments. Each signed-in user gets a separate workspace with an appointment calendar, transcripts, and follow-up notes.

Built with **Gemini 3.8 Live**, TypeScript, React, Vinext, Cloudflare Workers and D1/SQLite. The interface uses self-hosted Space Grotesk. No OpenAI API is used.

## Run locally

Requires Node.js 24+ and npm. On a fresh database, run both migrations in order once:

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_narrow_timeslip.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_spicy_baron_zemo.sql
npm run dev
```

Both migrations are already applied in the original development checkout. Open the URL printed by the server. Loopback development uses a simulated sign-in; production uses Sites' authenticated identity gateway. Local data is stored in ignored `.wrangler/state` and is never uploaded with the source.

## Gemini connection

Configure `GEMINI_API_KEY` as a **hosted secret** for shared voice access. For local use, copy `.env.example` to `.env` and provide your own key. Never use `NEXT_PUBLIC_` or `VITE_` for secrets.

Users may enter a personal key in **Configure assistant**. It takes precedence over the shared connection, remains in page memory only, and clears on reload. A rejected personal key never silently uses the shared key. Clear the field to use shared access again. Keys are exchanged server-side with Google for constrained, single-use ephemeral tokens; long-lived keys are never returned by an API or stored in the database.

Shared access permits five starts per user per UTC day, 40 starts globally per day, and five unexpired shared permits at once. Each user may hold two unexpired permits and start 12 sessions per UTC hour. Calls last up to 12 minutes; provider credentials expire after 15 minutes. Ending/deleting a call does not prematurely release a token permit. Authenticated writes are limited to 80 per UTC minute. See [operating limits](SECURITY.md).

Google offers a [Gemini Live free tier](https://ai.google.dev/gemini-api/docs/pricing), subject to account eligibility and quota. Personal keys follow their Google project's billing settings. These app limits are not a guaranteed monetary spending cap.

## Engineering features

- **Streaming audio:** AudioWorklet capture/resampling to mono PCM16 at 16 kHz, 24 kHz playback, transcription, interruption, mute, and microphone cleanup.
- **Transactional bookings:** every occupied 15-minute interval is reserved in an atomic D1 batch. A composite primary key prevents overlapping appointments under concurrent requests.
- **Idempotency:** repeated requests return the original booking; changed payloads with the same key fail. Cancellation atomically releases occupied intervals.
- **Session admission:** shared/user quotas, conservative token permits, fixed expiry, heartbeat authorization, abandoned-call reconciliation and bounded HTTP requests.
- **Recovery:** connection generations reject stale socket callbacks; tool responses wait for reconnection; serialized checkpoints and terminal-state guards prevent stale transcript writes.
- **Private workspaces:** owner-scoped APIs and rows, same-origin mutations, limited model tools, cursor-based call history, and permanent transcript deletion.
- **Bounded transcripts:** long turns split safely; very long histories show an explicit trimming notice instead of silently failing to save.

The model proposes actions; the server checks ownership, service, staff, date, hours, contact fields, confirmation flag and occupancy before committing. Spoken confirmation itself is model-interpreted; see the evaluation plan before customer use.

## Verification

```powershell
npm test
npm run typecheck
npm run build
# With the local server running:
node scripts/smoke-test.mjs
# Optional: enter a real key through hidden stdin, never as a command argument:
node scripts/verify-provider.mjs
```

The suite contains 29 tests covering booking races, isolation, time zones, PCM, shared quotas, expiry, deletion, transcript limits, parsing and recovery. API smoke checks use local D1. On 2026-10-07, a real provider check verified ephemeral-token issuance, audio generation, and an availability tool call with `gemini-3.8-live`, using synthetic conversation content and no microphone.

Actual microphone/device behavior, booking quality, forced-network resumption, latency and provider quota exhaustion still need the [manual evaluation](docs/evaluation.md). No measured accuracy, savings or latency SLA is claimed. GitHub Actions runs tests, TypeScript checks and a production build on pushes and pull requests.

## Product scope

This release is a **browser voice application** with public sign-in and isolated workspaces. It does not provision a phone number or connect to the PSTN. It has no SMS, email, payments, calendar sync or live human transfer; human assistance saves an owner-visible follow-up note.

Services, two stylists, opening hours and IST are defined in `lib/domain.ts`. Business name/location/greeting are editable. Bookings cover the next 30 days; the dashboard displays the next 100 appointments. History is paginated 20 calls at a time. Raw audio is not stored by Aria; transcripts and booking contact details persist in the database. Deleting a transcript removes its text and follow-up note, not related appointments. Google's processing terms apply to audio sent to Gemini.

## Deployment

GitHub hosts the source. **GitHub Pages cannot run this Worker/D1 backend.** Deploy through Sites, apply the tracked Drizzle migrations, configure secrets in the hosting environment, and preserve the trusted identity gateway. Never expose this Worker directly elsewhere without implementing verified authentication. A GitHub push runs CI; it does not automatically redeploy the live app.

## Source guide

| Location | Responsibility |
| --- | --- |
| `app/receptionist.tsx` | Dashboard, dialogs, history and calendar |
| `lib/live-client.ts` | Audio/session lifecycle and tool delivery |
| `public/pcm-capture.js`, `lib/audio.ts` | PCM capture, playback and interruption |
| `lib/gemini-config.ts`, `lib/gemini-token.ts` | Model instructions, tools and token constraints |
| `lib/call-store.ts`, `lib/voice-policy.ts` | Session admission, limits and lifecycle |
| `lib/booking.ts`, `db/schema.ts` | Booking invariants and persistence |
| `app/api/` | Authenticated APIs |
| `tests/`, `scripts/` | Verification and local tooling |

## Resume description

Built a real-time AI receptionist with Gemini Live and Cloudflare D1, implementing streaming audio, tool-driven booking, transactional conflict prevention, idempotent retries, tenant isolation and automated recovery tests.

For a nontechnical interviewer: **“It lets a busy salon take bookings by voice while preventing two people from getting the same appointment.”**
