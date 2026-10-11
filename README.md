# NeonSales ClickUp MCP

A private, cloud-hosted [Model Context Protocol](https://modelcontextprotocol.io/) server connecting authorized staff members to ClickUp through **their own individual ClickUp OAuth accounts**. The same remote MCP endpoint is intended for supported Claude and ChatGPT clients.

> **Release status — 11 October 2026:** Code for OAuth, scoped reads, core task writes and GitHub Actions deployment is on a **draft, unmerged PR stack**. Synthetic integration tests and local Cloudflare workerd security smoke pass, but no live ClickUp accounts, authorized Workspace/List or production Cloudflare secrets have been configured. **Not deployed; not fully accepted; do not claim live functionality.**

## Responsibilities — no duplicate systems

| Platform | Sole responsibility |
|---|---|
| **ClickUp** | Task data, staff permissions, activity/history, native attribution, existing comments, updates and any recovery it natively supports |
| **Claude / ChatGPT** | Per-tool allow/deny prompts, low-risk approvals and user-specific tool trust preferences |
| **NeonSales MCP** | OAuth verification and account mapping, forwarding bounded ClickUp API calls under each user's own token, input validation, fixed-resource scoping and rate-limit controls |
| **Cloudflare Workers** | Permanent HTTPS remote MCP hosting and encrypted per-user credential storage |
| **GitHub Actions** | Hosted CI and manual deployment to an isolated Cloudflare Worker; never hosts the persistent application |

**There is no NeonSales activity journal, duplicate audit dashboard, rollback engine or additional per-tool approval settings.** The previously proposed journal/rollback design was rejected by the owner and removed from the current feature branch.

## Implemented server tools

| Name | Effect | Purpose |
|---|---|---|
| `service_info` | Read | Show runtime configuration flags, not proof of connectivity |
| `connect_clickup_account` | Account operation | Return individual ClickUp authorization URL; no tokens to AI clients |
| `get_clickup_connection_status` | Read | Show only your own connection |
| `disconnect_clickup_account` | Account operation | Remove your local encrypted connection (revoke upstream in ClickUp separately) |
| `find_scoped_tasks` | Read | Get bounded tasks in configured home List |
| `get_scoped_task` | Read | Read known task ID after verifying its home List |
| `get_attention_report` | Read | Bounded overdue/upcoming/stale-task metadata; clearly flags incompleteness |
| `get_scoped_list` | Read | View authorized List name and valid status labels |
| `create_scoped_task` | Write | Create a task in the configured List under your own account |
| `clickup_tool_catalog` | Read | Inspect proposed schemas for further ClickUp capabilities; **not** an operational API |

**Security restriction:** The per-task update, comment-create and comment-read tools are deliberately **not advertised**. ClickUp's task-ID endpoints lack a supported atomic condition that enforces an unchanged home List. A task moved between preflight and the second request could escape our required List boundary. Never claim those features are functional until ClickUp offers a verified list-bound operation or a comparable documented primitive. The configured List is also verified against the approved Workspace's own Spaces list before any live tool operation. List metadata verification is not a lock against concurrent hierarchy changes.

Tools execute through the official `@modelcontextprotocol/server` v2 SDK and ClickUp REST API v2. Read operations require `mcp:read`; writes additionally require the explicitly consented `mcp:write` MCP OAuth scope. **This OAuth scope is not a duplicate client approval interface.** Users still control the AI client's own permission prompts.

The separate **48-capability model-facing schema catalogue** is descriptive. Most entries have **no backend implementation** and cannot be called operationally in the deployed Worker; isolated SDK preview tests deliberately reject them. Do not present this as full feature parity with ClickUp's first-party MCP.

## Deployment — cloud only

1. Review and merge the stacked draft PRs in dependency order, preserving all OAuth and strict CI changes: [#17](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/17) → [#18](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/18) → [#20](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/20) → [#21](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/21) → [#22](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/22) → [#23](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/23). Their earlier Phase 3 bases must also be reconciled into `main` first. Alternative schema PR #19 is **not** part of this stack. Never merge merely because a unit test passed.
2. Follow [Phase 5 individual OAuth and cloud-only setup](docs/PHASE5_USER_OAUTH_AND_CLOUD_CI.md): configure independent GitHub OAuth and ClickUp OAuth apps, the exact HTTPS callback origin, a dedicated staging KV, the required SQLite Durable Objects and per-user account mapping. Secrets belong in GitHub's protected staging environment and Cloudflare Worker Secrets, **not** in the repository, laptop or chat.
3. Run [Deploy NeonSales MCP staging](.github/workflows/deploy-staging.yml) manually on reviewed `main` via GitHub Actions. This runs tests and uses a pinned Wrangler to deploy an isolated Cloudflare staging Worker. It does **not** require a local laptop service.
4. Only enable `CLICKUP_OAUTH_ENABLED` and `CLICKUP_LIVE_ENABLED` after owner-approved staging setup, appropriate ClickUp List and individual user grants. Each employee completes their own ClickUp consent. Confirm real user attribution in ClickUp's native Activity and verify read/write restrictions on a disposable test List before operational rollout.

## Adversarial testing

Synthetic tests cover independently verified staff identity, forged bearer/header rejection, one-use OAuth state, wrong Workspace/account rejection before saving credentials, encrypted vault isolation, cross-List task substitution, foreign-Workspace List denial, unavailable task-ID mutation surfaces, write-scope OAuth step-up, 429 cooldown handling, invalid arguments, redirects, quota-denied operations, uncertain writes with **no automatic retry**, and a complete MCP SDK `tools/list` → `tools/call` write flow. The CI workflow requires format, lint, strict TypeScript, Vitest, Worker dry-run, real local workerd HTTPS security smoke, policy regression checks and dependency audit.

Run via GitHub Actions; no local development environment is required. Source [release evidence and limitations](docs/PROJECT_STATE.md), [tool schema](docs/CLICKUP_TOOL_SCHEMA.md) and [MCP conformance acceptance](docs/MCP_COMPLIANCE.md).

**Still unverified:** real ClickUp REST responses and native attribution, live Cloudflare deployment, end-to-end OAuth and token revocation, external Claude/ChatGPT subscription UI integration, official MCP conformance runner, and full first-party ClickUp MCP parity. Test fixtures cannot establish any of these. Never represent the service as operational without completing the relevant real acceptance steps.
