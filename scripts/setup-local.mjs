import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
if (!existsSync(".dev.vars"))
  writeFileSync(
    ".dev.vars",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\nBETTER_AUTH_URL=http://127.0.0.1:5173\n`,
  );
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "wrangler.jsonc",
    "--persist-to",
    ".wrangler/standalone",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
