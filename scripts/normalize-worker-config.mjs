import { readFileSync, writeFileSync } from "node:fs";
// The pinned Vite adapter emits this retired Wrangler field. Its old default
// behavior is now unconditional in current Wrangler, so omit the field.
const path = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
delete config.legacy_env;
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
