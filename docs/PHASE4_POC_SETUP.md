# Phase 4 staging POC — ClickUp read-only tool acceptance

**Status:** Code PR #17 is draft; not a production or staging deployment authorization. Current CI may still be running. Read-only scope only.

## Decision to make before enabling any live read

The owner must approve **one ClickUp List**, its containing Workspace, and the **numeric GitHub IDs** who may read it. The GitHub OAuth sign-in allowlist alone is not a ClickUp data grant. Use a new empty or synthetic-data List to demonstrate this safely; do not start with confidential customer records.

ClickUp's official API allows personal tokens for individual testing, and OAuth for multi-person integrations. This initial backend adapter accepts one **server-held ClickUp API token** with the permissions of its issuing ClickUp user. It does not give each staff user their own ClickUp token or scope; the application's additional READ-grant policy is enforced on every tool call. For eventual production, move to per-user ClickUp OAuth and independently reviewed app-level grants.

## Runtime configuration (stage only)

Requires the existing protected Phase 3 staging Worker with its GitHub OAuth/Cloudflare KV secrets, plus:

- `CLICKUP_LIVE_ENABLED` = `true` **only as the last step** after all acceptance prerequisites are satisfied; otherwise no ClickUp network requests are issued.
- `CLICKUP_LIST_ID`: approved numeric list ID (from ClickUp's List link).
- `CLICKUP_READ_GITHUB_IDS`: comma-separated set of 1–4 numeric IDs, all also present in `ALLOWED_GITHUB_IDS`.
- `CLICKUP_API_TOKEN`: backend ClickUp API credential, stored only as a Cloudflare Worker secret; never GitHub/CI/chat.
- `CLICKUP_QUOTA`: SQLite-backed Durable Object binding `ClickUpQuota` with the **separate staging** namespace and migration.

The repo's `wrangler.jsonc` declares the binding and a new `phase4-v1` SQLite migration for build validation; it is **not** permission to deploy to the production Worker. For a separately maintained `wrangler.staging.jsonc`, add those `durable_objects.bindings` and `migrations` entries before deploying, while preserving its `workers_dev: true`, dedicated OAuth KV and distinct Worker name. Do not reuse production KV/DO namespaces or accidentally change the public address.

Cloudflare CLI secrets must be written by the owner directly to staging, never pasted into chat:

```bash
npx wrangler secret put CLICKUP_API_TOKEN --config wrangler.staging.jsonc
npx wrangler secret put CLICKUP_LIST_ID --config wrangler.staging.jsonc
npx wrangler secret put CLICKUP_READ_GITHUB_IDS --config wrangler.staging.jsonc
# ONLY after explicit grant review, isolated test List and live acceptance go-ahead:
npx wrangler secret put CLICKUP_LIVE_ENABLED --config wrangler.staging.jsonc
```

**Security note:** Every `wrangler secret put` publishes a new Worker version. The last command is the live-read activation. Do not run these commands on an unreviewed source branch or an active production Worker.

## Demonstration sequence

1. CI must be green for exact PR #17 HEAD: project policies, npm reproducibility, formatting, lint, three TypeScript configurations, tests, Wrangler dry-run, workerd OAuth security smoke and dependency audit. This is synthetic evidence, NOT ClickUp connectivity.
2. Review the scope permissions: one List, one staff GitHub ID, no write API methods, 80 requests/rolling minute token-wide, 30/staff minute and no error-header redirects.
3. Deploy the reviewed Phase 4 code to a **new, isolated staging Worker** with the proper KV, Durable Object migration and secrets. Keep `CLICKUP_LIVE_ENABLED` absent until confirmed.
4. Confirm unauthenticated `/mcp` still returns HTTP 401, while invalid/forged bearer gets HTTP 401 and nonexistent grant returns an explicit denial with **zero ClickUp requests**.
5. After enabling live reads, connect with the allowlisted GitHub identity through Claude's existing official remote MCP custom connector. Run `find_scoped_tasks` with `max_results: 5`, `get_scoped_task` for a known task in that test List, and `get_attention_report` with `lookahead_hours: 24`. Verify exact IDs/names against ClickUp. Check `source: clickup-api-v2`, List ID, `pages_scanned` and `incomplete` in the returned data.
6. Test a second GitHub login that is allowed to sign in but **not** on `CLICKUP_READ_GITHUB_IDS` — all ClickUp tools must return `CLICKUP_ACCESS_DENIED` without outbound calls. Revoke a previously approved ID and confirm the next invocation fails.
7. Exercise a foreign-home-List task ID, invalid ID, 401/403, 429 and two concurrent permitted users. Record redacted evidence in `docs/DEMO_ACCEPTANCE.md`. Do not call synthetic tests a live acceptance pass.

## Source of truth

- ClickUp [official API overview](https://developer.clickup.com/docs/Getting%20Started), [Get Tasks](https://developer.clickup.com/reference/gettasks), [Get Task](https://developer.clickup.com/reference/gettask), [authentication](https://developer.clickup.com/docs/authentication) and [rate limits](https://developer.clickup.com/docs/rate-limits).
- Cloudflare [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) and [Wrangler bindings/migrations](https://developers.cloudflare.com/workers/wrangler/configuration/).
- Official MCP SDK v2 + existing GitHub OAuth from Phase 3; no homemade MCP protocol or alternate authentication shortcut.

## Missing proof

Actual real ClickUp data retrieval, Cloudflare Durable Object concurrency under workerd, two-person ClickUp grants, and ChatGPT Plus native custom MCP eligibility are **not verified by repository unit tests**. Phase 4 is not suitable for production or any write operation.
