# Independent Cloudflare deployment

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

## Deployment

The app now targets **Cloudflare Workers with D1** directly. It does not depend on ChatGPT sign-in or a `.chatgpt.site` domain. The hosting account must be authenticated before deployment. GitHub Pages cannot run this backend.

1. Run `npx wrangler login` and create a database with `npx wrangler d1 create aria-receptionist-db`.
2. Replace the local placeholder database ID in `wrangler.jsonc` with the returned ID.
3. Set `vars.BETTER_AUTH_URL` in that file to the Worker's actual HTTPS URL.
4. Configure a fresh random `BETTER_AUTH_SECRET` (32+ bytes) and the optional shared `GEMINI_API_KEY` using `npx wrangler secret put <NAME>`.
5. Run `npm run deploy`. It validates configuration, builds, applies pending remote migrations, and publishes the built Worker.

A GitHub push runs checks; it does not automatically deploy. The previous Sites project reference is preserved in `docs/legacy-sites.json` for recovery. Existing Sites accounts/data are not automatically linked to new accounts; migrating any existing records requires an explicit verified ownership mapping. The old database is not deleted by this migration.


## Checks

Run `npm test`, `npm run typecheck`, and `npm run build`. With `npm start` running, execute `node scripts/auth-smoke-test.mjs` and `node scripts/smoke-test.mjs`. These exercise the built Worker, real account sessions, isolation, CSRF, revocation, body limits, and booking races. See [Security](../SECURITY.md) for key and quota policy.
