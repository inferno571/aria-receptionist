# Aria — AI voice receptionist

[Architecture](docs/architecture.md) · [Security](SECURITY.md)

Aria talks to customers, checks a salon's availability, and books confirmed appointments. Each signed-in user gets a separate workspace with an appointment calendar, transcripts, and follow-up notes.

Built with **Gemini 3.8 Live**, TypeScript, React, Vinext, Cloudflare Workers and D1/SQLite. The interface uses self-hosted Open Sans. No OpenAI API is used.

## Run locally

Requires Node.js 24+ and npm:

```powershell
npm ci
npm run setup:local
npm run dev
```

Open `http://127.0.0.1:5173` and create an account. Local setup creates a random ignored `.dev.vars` authentication secret and applies pending migrations to `.wrangler/standalone`. Local and production use the same real authentication flow; there is no mock sign-in or trusted identity header. Local data and secrets never go to GitHub.

## Accounts

Email/password accounts use Better Auth, scrypt password hashing, signed HttpOnly session cookies, server-side revocation, and database-backed sign-in limits. Passwords must contain at least 12 characters. Tenancy is based on the immutable authenticated user ID. Email ownership is not verified, no accounts are linked by email, and email password recovery is not yet configured. Save your password in a password manager.

## Gemini connection

Configure `GEMINI_API_KEY` as a **hosted secret** for shared voice access. For local use, edit ignored `.dev.vars` and provide your own key. Never use `NEXT_PUBLIC_` or `VITE_` for secrets.

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
node scripts/auth-smoke-test.mjs
node scripts/smoke-test.mjs
# Optional: enter a real key through hidden stdin, never as a command argument:
node scripts/verify-provider.mjs
```

The suite contains 29 tests covering booking races, isolation, time zones, PCM, shared quotas, expiry, deletion, transcript limits, parsing and recovery. API smoke checks use local D1. Authentication integration checks cover registration, sign-in, isolated identities, forged headers/cookies, CSRF, session revocation and rate limits. On 2026-10-07, a real provider check verified ephemeral-token issuance, audio generation, and an availability tool call with `gemini-3.8-live`, using synthetic conversation content and no microphone.

Actual microphone/device behavior, booking quality, forced-network resumption, latency and provider quota exhaustion still need the [manual evaluation](docs/evaluation.md). No measured accuracy, savings or latency SLA is claimed. GitHub Actions runs tests, TypeScript checks and a production build on pushes and pull requests.

## Product scope

This release is a **browser voice application** with public sign-in and isolated workspaces. It does not provision a phone number or connect to the PSTN. It has no SMS, email, payments, calendar sync or live human transfer; human assistance saves an owner-visible follow-up note.

Services, two stylists, opening hours and IST are defined in `lib/domain.ts`. Business name/location/greeting are editable. Bookings cover the next 30 days; the dashboard displays the next 100 appointments. History is paginated 20 calls at a time. Raw audio is not stored by Aria; transcripts and booking contact details persist in the database. Deleting a transcript removes its text and follow-up note, not related appointments. Google's processing terms apply to audio sent to Gemini.

## Deployment

The app now targets **Cloudflare Workers with D1** directly. It does not depend on ChatGPT sign-in or a `.chatgpt.site` domain. The hosting account must be authenticated before deployment. GitHub Pages cannot run this backend.

1. Run `npx wrangler login` and create a database with `npx wrangler d1 create aria-receptionist-db`.
2. Replace the local placeholder database ID in `wrangler.jsonc` with the returned ID.
3. Set `vars.BETTER_AUTH_URL` in that file to the Worker's actual HTTPS URL.
4. Configure a fresh random `BETTER_AUTH_SECRET` (32+ bytes) and the optional shared `GEMINI_API_KEY` using `npx wrangler secret put <NAME>`.
5. Run `npm run deploy`. It validates configuration, builds, applies pending remote migrations, and publishes the built Worker.

A GitHub push runs checks; it does not automatically deploy. The previous Sites project reference is preserved in `docs/legacy-sites.json` for recovery. Existing Sites accounts/data are not automatically linked to new accounts; migrating any existing records requires an explicit verified ownership mapping. The old database is not deleted by this migration.

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
