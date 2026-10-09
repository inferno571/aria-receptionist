import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (
  !config.d1_databases?.[0]?.database_id ||
  config.d1_databases[0].database_id.startsWith("00000000-")
)
  throw new Error(
    "Create your Cloudflare D1 database and set its ID in wrangler.jsonc before deployment.",
  );
if (!config.vars?.BETTER_AUTH_URL?.startsWith("https://"))
  throw new Error(
    "Set vars.BETTER_AUTH_URL to your verified HTTPS Worker URL in wrangler.jsonc.",
  );
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const secretCheck = spawnSync(
  process.execPath,
  [wrangler, "secret", "list", "--config", "wrangler.jsonc"],
  { encoding: "utf8" },
);
if (secretCheck.status !== 0)
  throw new Error(
    "Sign in to Cloudflare and configure Worker secrets before deployment.",
  );
const names = JSON.parse(secretCheck.stdout).map((x) => x.name);
if (!names.includes("BETTER_AUTH_SECRET"))
  throw new Error(
    "Configure BETTER_AUTH_SECRET as a Worker secret before deployment.",
  );
for (const args of [
  ["scripts/run-framework.mjs", "build"],
  ["scripts/normalize-worker-config.mjs"],
  [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    "wrangler.jsonc",
  ],
  [wrangler, "deploy", "--config", "dist/server/wrangler.json"],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
