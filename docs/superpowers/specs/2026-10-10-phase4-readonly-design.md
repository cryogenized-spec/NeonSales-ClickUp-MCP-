# Phase 4 — verified-principal, list-scoped ClickUp reads and attention report

**Status:** PROPOSED DESIGN FOR OWNER REVIEW ONLY, 2026-10-10 SAST. No Phase 4 code, credentials, live ClickUp calls, new Worker deployment, or approval for any task write is included. This document is stacked after the Phase 3 OAuth draft PR #4 and must not be treated as Phase 3 live acceptance.

## Purpose and non-negotiable invariants

One remote MCP Worker for **2–4 independent staff users**, regardless of whether the client is ChatGPT or Claude. Authentication belongs to Phase 3 OAuth, **authorization belongs to the application** on every tool invocation, ClickUp's own REST token is never exposed to an MCP caller, and **one token has one shared quota across all staff and all Cloudflare isolates**.

Implement **read-only** List task discovery, one scoped task lookup and a bounded attention report. No create/update/delete, no ClickUp webhooks, no model-provided list/workspace permissions, no external background polling, no approvals, no writes, no claims of real account acceptance.

## Boundary and authority diagram

```text
ChatGPT / Claude OAuth clients (untrusted arguments; different staff members)
        |
        v
Cloudflare OAuthProvider (Phase 3: verifies bearer token, audience, expiry, scope)
        |
        v
Official MCP SDK v2 HTTP authInfo (one verified subject per request)
        |
        v
Phase 4 policy: subject -> explicit owner-approved Workspace/List READ grant
        |
        +-- deny before network on missing/wrong subject, scope, list or task
        |
        v
One Durable Object quota coordinator per underlying ClickUp token identity
        |             (durable reservations, no per-isolate optimistic counts)
        v
ClickUp adapter with server-side API token, exact read endpoints and hard limits
        |
        v
Normalization / provenance / redaction / SAST timestamps -> MCP result
```

No OAuth implementation duplicates, no second identity store that treats user-supplied IDs as verified. The current Phase 3 `ctx.http.authInfo.extra.subject` boundary remains the sole authenticated identity source. Never accept `userId`, `scope`, or `list_id` from a tool call as authority.

## Explicit read-only tool contract proposal

1. `find_scoped_tasks`: optional status selection, optional due-date window, and an explicit small `max_results` (1–50; default 20). Uses the **configured** list, not a client-supplied list. Defaults `include_closed=false`, `subtasks=false`, `include_timl=false`. Pagination from page 0; maximum 3 pages / 300 raw records scanned and hard output cap 50. Respond with normalized IDs, names (sanitized), statuses, due/updated UTC epoch provenance, URL only if verified, an `incomplete` flag and a reason if page ceiling or upstream failure prevents complete coverage. Do not present a truncated search as exhaustive.
2. `get_scoped_task`: validated task ID only; `GET /task/{task_id}` with custom IDs DISABLED. A task is released only when the ClickUp response is an explicit match to the server-approved home List and the application grant matches the authenticated subject; otherwise return a non-disclosing authorization failure. A task in another home List is denied even if visible through tasks-in-multiple-lists until separate membership authorization is designed.
3. `get_attention_report`: explicitly named `lookahead_hours` bounded 1–48, optional `include_overdue`; separate categories for `overdue`, `due_soon` and `not_updated_for_48h` where each predicate is actually computable from verified task metadata. The report never confuses "due in 48h" with "not updated for 48h". Include current evaluation time **SAST (UTC+02:00)** with UTC backing timestamp, a source List, number of pages scanned and the `incomplete` indicator. No falsely complete reports on upstream errors.
4. Retain current `service_info` as an explicitly diagnostic tool; do not label synthetic test responses or disconnected configurations as live ClickUp.

All production read tools declare truthful MCP `readOnlyHint=true` and `destructiveHint=false` and enforce it with an adapter allowing GET only. Tool annotations alone are **not** an enforcement boundary. Schema fields are closed (`additionalProperties:false`), strictly size-bounded, and tool output is small; no arbitrary ClickUp endpoint, Markdown-to-HTML execution, customer PII dumps or generated prompts from task text.

## Server-side policy

- **Proposed configuration, not yet approved/created:** `CLICKUP_API_TOKEN` is a Worker secret; `CLICKUP_WORKSPACE_ID` and `CLICKUP_LIST_ID` identify a single explicitly owner-approved scope. Staff-to-List READ grants live in server-controlled bindings/configuration; verify identity and grant on each call. An OAuth allowlist alone **never** grants task data visibility. Do not assign a read grant merely because an MCP user can log in.
- Fail closed if a binding, token, principal, list permission, global rate coordinator, server clock, HTTP request or response schema is unexpected. Configuration requires owner to confirm the list belongs to the intended Workspace; no Workspace-wide enumeration.
- Scope checks happen **before** constructing an outbound request. For `get_scoped_task`, the upstream lookup may fetch task metadata but must not emit disallowed task content on a list mismatch. If this possible external lookup is unacceptable to the owner, require list-membership discovery first instead.
- API token scope is **shared** and not proof of any staff member's authorization. Staff rights and logged attribution come solely from the verified app principal.
- All egress originates only at `https://api.clickup.com/api/v2` and exact allowlisted GET path templates. Never follow a user-supplied URL, arbitrary redirect or error-provided host; sanitize any response links. Token must never appear in logs, errors, tool outputs, traces or commit history.
- If neither a real staging environment nor an approved ClickUp read token is available, tests remain synthetic and `liveClickUp=false`.

## One coordinated token quota, retries and partial failures

ClickUp publishes **100 requests/minute/token** for Free Forever and Unlimited and says rate limits are token-wide rather than user-wide. See https://developer.clickup.com/docs/rate-limits.

- Use a single Cloudflare **Durable Object per credential identity** with SQLite-backed persistent reservations; Cloudflare's per-Object coordination and strongly consistent storage avoid four Workers independently believing they each have 100 calls.
- Start with conservative `MAX_LOCAL_PER_60S=80`, leaving at least 20 for other non-MCP consumers **only as a local target**; do not claim this protects against external callers sharing the token. Adapt downward on ClickUp `X-RateLimit-Limit`/remaining/reset values and obey 429. Store no raw token in coordinator keys or logs; persistent state must survive restarts.
- Atomically reserve a request before dispatch; an internal budget rejection produces a bounded retry-after / explicit rate-limited result and issues zero ClickUp requests. Cap per-person acquisition, prevent starvation of other staff, bound the queue, and never hold outbound ClickUp calls inside long database transactions.
- For 429 read `X-RateLimit-Reset` as a Unix timestamp. Do not spin or immediately retry during the blocked window. A GET may have a bounded retry only when deadline and quota permit; never conceal 401, 403, 404, schema mismatch or repeated 5xx as an empty successful result.
- Distinguish **complete, partial-with-evidence, and unavailable**. If a page fails after earlier pages, preserve provenance and explicitly mark partial; if a source is unauthorized, return failure and do not leak the previous pages as a deceptive success. Set tight request deadlines; cancellation and concurrency must not undercount quota.
- Pagination: `GET /list/{list_id}/task?page=0..N`; ClickUp documents **up to 100 tasks per page** and home-List-only results by default. Do not infer complete from the first page merely because it contains fewer than 100 unless the API contract/evidence supports that stopping rule.

## Suggested implementation modules (no code in this design)

- `src/authorization/list-policy.ts`: fail-closed `AuthInfo` → immutable `PrincipalGrant`.
- `src/clickup/read-client.ts`: injectable HTTP fetch, stable host/path templates, validated response decoding, strict timeouts, no writes.
- `src/clickup/quota.ts` + `src/clickup/quota-object.ts`: Durable Object reservation contract, persistence, 429 window and per-staff fairness.
- `src/tasks/read.ts`, `src/reports/attention.ts`: normalization, deduplication, SAST time predicates and partial-state result model.
- `src/mcp/create-server.ts`: minimal closed-schema read-only tool bindings; no direct ClickUp fetch in an MCP callback.
- `tests/phase4-*.test.ts`: fake endpoints + controlled clocks + real SDK authInfo propagation into the app layer.

## Adversarial acceptance matrix

- **Authorization:** missing/expired/wrong-audience token, mismatched grant, forged subject/list/tool argument, revoked staff, wrong Workspace/List, arbitrary task ID, cross-staff parallel requests → denied, **zero unauthorized outbound calls**.
- **Concurrency:** 4 principals × parallel tools sharing one token and even separate simulated Worker isolates → never oversubscribe persistent 80/min local quota. Restart/eviction and injected Durable Object/storage failures cannot reset the budget. Fairness prevents one staff member monopolizing the quota.
- **API failures:** 401/403/404, 429 reset, non-JSON, invalid fields, missing page, timeout, connection reset, 5xx and malformed URL → bounded, truthful errors; never empty success/PII leakage or unbounded retries.
- **Pagination/reporting:** page0/1/2, duplicate tasks, deleted task between pages, Tasks-in-Multiple-Lists, future/past due dates, missing due timestamps, timezone edges (including 00:00 SAST), stale/overdue semantic distinction, 48-hour boundary, stable ordering and capped outputs.
- **Security:** prompt-injection text in a task description is inert data; HTML/script rendered as text, no copied bearer tokens, no arbitrary URL fetch or unapproved non-GET call.
- **Mechanical:** strict TypeScript profiles, ESLint, formatting, npm ci/lockfile, old 56 OAuth/SDK tests unchanged, new Phase 4 tests, Worker dry-run, policy tests, exact-SHA green CI and Codex specialist review after mechanical green.
- **External acceptance separate:** owner approves precisely which Workspace/List and who can read it, then a bounded live staging read under an authorized ClickUp account with provenance; real OAuth clients and shared rate budget tested under controlled staging before any production use. No real ClickUp task mutation in Phase 4.

## Open decisions for owner (do not guess)

1. Confirm the **one** approved ClickUp Workspace/List for the first read-only POC and which authenticated staff principals get READ access.
2. Approve Durable Objects as a new persistent dependency and its Cloudflare account/cost implications; choose the expected external token-usage reserve.
3. Decide whether task titles/assignees/description snippets may be returned to ChatGPT/Claude; default to **minimal metadata** and no description.

## Primary official references

- ClickUp API rate limits: https://developer.clickup.com/docs/rate-limits
- Get Tasks: https://developer.clickup.com/reference/gettasks
- Get Task: https://developer.clickup.com/reference/gettask
- Cloudflare Durable Objects persistent storage: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- SQLite-backed Durable Objects: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
