/**
 * GitHub-hosted Actions creates an isolated staging-only Worker manifest.
 * Never include auth/client secrets in this manifest or in generated logs.
 * OAuth client secrets and individual user credentials live only on Cloudflare.
 */
import { writeFileSync } from "node:fs";

const kv = process.env.STAGING_OAUTH_KV_ID;
if (typeof kv !== "string" || !/^[a-f0-9]{32}$/i.test(kv)) {
  throw new Error("Missing valid STAGING_OAUTH_KV_ID in GitHub staging environment vars");
}
const stage = {
  name: "neonsales-clickup-mcp-staging",
  main: "src/index.ts",
  compatibility_date: "2026-10-10",
  compatibility_flags: ["global_fetch_strictly_public"],
  workers_dev: true,
  kv_namespaces: [{ binding: "OAUTH_KV", id: kv }],
  durable_objects: {
    bindings: [
      { name: "CLICKUP_QUOTA", class_name: "ClickUpQuota" },
      { name: "CLICKUP_CONNECTIONS", class_name: "ClickUpUserConnection" },
    ],
  },
  migrations: [
    { tag: "phase4-v1", new_sqlite_classes: ["ClickUpQuota"] },
    { tag: "phase5-user-oauth", new_sqlite_classes: ["ClickUpUserConnection"] },
  ],
};
writeFileSync(".wrangler-staging.generated.jsonc", JSON.stringify(stage, null, 2) + "\n", { mode: 0o600 });
console.log("Isolated staging manifest generated (KV ID and all secrets redacted).");
