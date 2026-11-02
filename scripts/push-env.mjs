// Copies secrets from an env file to the linked Railway service. Prints names only, never values.
// Usage: node scripts/push-env.mjs "path/to/.env" (defaults to env/.env.local)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SYNCED = ["COMPANIES_HOUSE_API_KEY", "ANTHROPIC_API_KEY", "APP_PASSWORD"];

const values = new Map();
for (const line of readFileSync(process.argv[2] ?? "env/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m) values.set(m[1], m[2].replace(/^(['"])(.*)\1$/, "$2"));
}

let failed = false;
for (const name of SYNCED) {
  const value = values.get(name);
  if (!value) {
    console.log(`${name}: empty, skipped`);
    continue;
  }
  // Sent on stdin so the value stays out of the process list and shell history.
  const res = spawnSync("railway", ["variable", "set", name, "--stdin", "--skip-deploys"], {
    input: value,
    shell: true,
    stdio: ["pipe", "ignore", "ignore"],
  });
  console.log(`${name}: ${res.status === 0 ? "set" : "FAILED"}`);
  if (res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
