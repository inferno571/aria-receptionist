# Security and deployment

Production must run behind the Sites dispatcher. It authenticates visitors and strips/replaces identity headers before requests reach the Worker. Do not expose this Worker directly on another host: accepting those headers without a trusted gateway would permit impersonation. GitHub hosts the source; the app's live backend remains on Sites and D1.

`GEMINI_API_KEY` is a hosted secret. Never commit it, prefix it with `NEXT_PUBLIC_`/`VITE_`, or return it from an API. A user's nonempty personal key takes precedence, remains in page memory, and is exchanged for a constrained ephemeral token. A rejected personal key never falls back silently to the shared project. Reload clears personal keys. Both key types are sent only to Google's API by the server.

Shared access admits at most five starts per user per UTC day, 40 total per UTC day, and five unexpired permits globally. Each user can hold at most two unexpired permits and start at most 12 sessions per UTC hour. Provider tokens expire after 15 minutes and app booking actions expire after 12 minutes. Ending or deleting a call does not release its token permit early. Each authenticated user is also limited to 80 write requests per UTC minute. Quota admission uses atomic D1 transactions and database constraints. These are usage limits, not a guaranteed currency-denominated spending cap; Google billing and provider quotas still apply.

Call records become interrupted after a two-minute heartbeat gap or expiry; reconciliation runs when the owner reads history or starts a call. Tool authorization checks expiry and heartbeat on every action, so authorization does not depend on that housekeeping running. Transcript deletions erase transcript text and follow-up content while preserving non-content permit metadata. Appointments are retained independently.

Never post keys, customer details or transcripts in a public issue. Rotate an exposed key in Google AI Studio and update the hosted secret, then redeploy. Existing ephemeral tokens can remain valid until their short expiration window ends.
