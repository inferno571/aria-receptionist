# Aria — AI voice receptionist

An AI receptionist that listens to a customer, checks the salon's calendar, and books a confirmed appointment. The owner can inspect transcripts, see follow-up requests, and manage the calendar from one dashboard.

Built with **Gemini 3.8 Live**, TypeScript, React, Vinext, Cloudflare Workers, and D1/SQLite. No OpenAI API or paid fallback model is used.

## Run locally

Requires Node.js 24+ (the tests use `node:sqlite`) and npm. From this directory:

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_narrow_timeslip.sql
npm run dev
```

Run the initial migration **once on a fresh local database**, not on each start. It has already been applied in this checkout. Open the localhost URL printed by the server. Development sign-in is simulated for loopback requests; hosted sign-in uses the authenticated Sites owner. Local data stays in the ignored `.wrangler/state` directory and is not uploaded to the hosted database.

The calendar works without a Gemini key. For voice, open **Configure assistant**, get an API key from [Google AI Studio](https://aistudio.google.com/apikey), and paste it into the password field. The key stays in page memory until reload and is sent over HTTPS to the app's token endpoint. That endpoint exchanges it with Google for a constrained, short-lived Live token. The long-lived key is not written to browser storage or the database.

Alternatively copy `.env.example` to `.env` and set `GEMINI_API_KEY` locally. Never use a public-prefixed environment variable or commit a key. A server key takes precedence over the session key. Configure hosted keys as deployment secrets; this repository ships without a key.

Use headphones, allow microphone access, then say: “I'd like a haircut tomorrow afternoon.” Supply a fictional name and phone for a portfolio demo, and confirm the details when Aria reads them back. The appointment appears in the calendar only after the server commits it. Browser refresh preserves bookings and saved call history.

## What makes it more than a chatbot

- **Real audio streaming:** an AudioWorklet captures mono PCM16 at 16 kHz; Gemini returns 24 kHz audio with input/output transcription. Interrupting Aria clears pending playback. Mute and end controls release the microphone.
- **Reliable booking:** appointments reserve every occupied 15-minute interval in a D1 transaction. A database uniqueness constraint makes overlapping bookings mutually exclusive, even when requests race.
- **Safe retries:** an owner-scoped idempotency key returns the original result after a lost response. Reusing that key with changed details fails. Cancellation releases all occupied intervals atomically.
- **Recovery:** resumable Live sessions, generation checks against old sockets, queued tool responses during reconnect, serialized transcript checkpoints, and terminal call states that cannot be reopened by delayed writes.
- **Server authority:** tools validate service, staff, time, phone, ownership and confirmation. Follow-up outcomes are server-owned and cannot be erased by transcript saves. A follow-up retains priority over a later booking outcome.
- **Scoped data:** authenticated owner scoping on every API and calendar row; same-origin JSON mutations; constrained ephemeral credentials. The model receives business context and available times, not other customers' records.

See [architecture and tradeoffs](docs/architecture.md) and the [evaluation plan](docs/evaluation.md).

## Verification

```powershell
npm test
npm run typecheck
npm run build
# With the local development server running:
node scripts/smoke-test.mjs
```

The test suite covers 16 booking, isolation, time-zone, PCM, recovery and transcript-ordering cases. The smoke workflow exercises authenticated APIs against the local D1 runtime, including simultaneous conflicting bookings, repeated cancellation, missing-key errors and a delayed active save after a completed call. It leaves clearly labeled synthetic call history and a cancelled test appointment locally.

Live model quality, actual microphone/device behavior, service latency and provider quota exhaustion need a real Gemini key and the manual evaluation. Do not claim measured booking accuracy, latency, call volume or cost savings before running it.

## Scope and cost

This is an owner-private **browser voice demo**, not a public phone number or PSTN call center. Services, staff, hours and IST are an explicit single-salon configuration. The calendar supports the next 30 days; the dashboard shows the next 100 appointments and most recent 20 calls. Calls stop after 12 minutes. There is no SMS, email, payment processing, calendar sync or live human transfer; a human request creates an owner-visible note.

Google lists a free tier for [Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), subject to project eligibility and [quotas/pricing](https://ai.google.dev/gemini-api/docs/pricing). Aria does not enable billing or switch to a paid model, but a billing-enabled Google project follows its own plan. Audio and conversational content go to Google; free-tier data treatment follows Google's current terms. Use synthetic customer information for demonstrations. Raw audio is not stored by Aria; transcripts and booking contact information persist in the private database.

## Resume wording

“Built Aria, a real-time AI voice receptionist using Gemini Live, TypeScript and Cloudflare D1, with streaming audio, tool-driven appointment booking, transactional conflict prevention, idempotent retries, and automated recovery tests.”

Use that wording after you can demonstrate and explain the system. Add performance numbers only after measuring them. For an interviewer: **“It lets a busy salon take bookings by voice, while preventing two people from getting the same appointment.”**

## Source guide

| File | Responsibility |
| --- | --- |
| `app/receptionist.tsx` | Dashboard, dialogs, calendar, live transcript |
| `lib/live-client.ts` | Audio/session lifecycle and tool dispatch |
| `public/pcm-capture.js`, `lib/audio.ts` | Capture, resampling, playback and interruption |
| `lib/gemini-config.ts` | Grounded instructions and typed Gemini tools |
| `app/api/live-token/route.ts` | Server-only ephemeral-token exchange |
| `lib/booking.ts`, `db/schema.ts` | Booking invariants and persistence |
| `app/api/tools/route.ts` | Authenticated, validated model actions |
| `tests/`, `scripts/smoke-test.mjs` | Regression and API verification |

Deployment uses the included Sites configuration, Workers output in `dist/server`, and the generated migration in `drizzle/`. Preserve the Vite/Sites build integration when extending it.
