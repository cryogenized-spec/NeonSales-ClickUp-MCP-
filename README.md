# NeonSales ClickUp MCP — phased development

**Project status (11 October 2026):** Draft Phase 4 [read-only POC PR #17](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/17) and stacked [full schema PR #19](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/19) are isolated and **NOT merged or deployed**. Phase 3 staging OAuth was independently exercised through Claude earlier, but full revocation/conformance review remains open. The configured server now defines 52 MCP tool contracts: three bounded live-ready read tools (still blocked without new owner-approved credentials and grant), 47 no-op planned schemas, service_info and get_tool_catalog. **No ClickUp write capability is active.** Read [the full tool schema](docs/FULL_TOOL_SCHEMA.md) and [the project checkpoint](docs/PROJECT_STATE.md) before treating a schema as functionality.

**Purpose:** Build a private, authenticated, vendor-neutral remote MCP service that gives ChatGPT and Claude controlled access to NeonSales ClickUp data through ClickUp's official REST API. Prove the workflow against real, permitted records before showing management. This is an internal prototype, not a product offering.

## What we are trying to prove

1. From an ordinary **ChatGPT subscription** via a supported **custom MCP plugin**, invoke a NeonSales tool without buying separate model API usage.
2. From an ordinary **Claude subscription** via its **remote MCP custom connector**, invoke the **same** server and tools.
3. Retrieve real tasks from the permitted ClickUp Workspace/List and return truthful, traceable results.
4. Identify overdue work and tasks with ClickUp `date_updated` older than 48 hours, grouped by assignee; clearly distinguish task metadata from evidence of actual staff inactivity.
5. Prepare a proposed update without mutating ClickUp; execute only after independent owner approval, only on a disposable test task during the POC.
6. Produce a documented demonstration, a security check, and a clear cost/limits breakdown before any commercial pitch.

**Not yet proven:** live ClickUp reads/writes by this POC, hosted OAuth, cloud deployment, subscription UI connectivity, production security, uptime or cost at scale.

## What's in the repository

- [AGENTS.md](AGENTS.md) — binding working rules for coding agents and future chats.
- [CLAUDE.md](CLAUDE.md) — short Claude entry point; defers to the same rules.
- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — canonical handoff/checkpoint: verified facts, pending decisions and next action.
- [docs/ARCHITECTURE_PROPOSAL.md](docs/ARCHITECTURE_PROPOSAL.md) — proposed stack, options, boundaries and security model; **requires review before implementation**.
- [docs/DECISIONS.md](docs/DECISIONS.md) — explicit accepted/proposed/rejected architectural decisions.
- [docs/DEMO_ACCEPTANCE.md](docs/DEMO_ACCEPTANCE.md) — falsifiable pass/fail criteria.
- [docs/MCP_COMPLIANCE.md](docs/MCP_COMPLIANCE.md) — current MCP 2026-07-28 specification, official SDK v2 and conformance gates.
- [docs/MODULARITY.md](docs/MODULARITY.md) — module boundaries and failure containment.
- [docs/SKILLS.md](docs/SKILLS.md) — six pinned, upstream-authored development skills and license.
- [docs/BRANCH_PROTECTION.md](docs/BRANCH_PROTECTION.md) — strict CI, rulesets, plan restrictions and manual enforcement step.
- [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md) — manual Cloudflare KV/GitHub OAuth setup and live multi-user acceptance.
- [docs/FULL_TOOL_SCHEMA.md](docs/FULL_TOOL_SCHEMA.md) — complete model-facing ClickUp MCP capability catalog, typed inputs/outputs, risks and actual availability status.
- [docs/PHASE4_POC_SETUP.md](docs/PHASE4_POC_SETUP.md) — read-only staging authorization and acceptance runbook.
- [docs/phases/ROADMAP.md](docs/phases/ROADMAP.md) — mandatory one-phase-at-a-time delivery.
- [docs/SECURITY_PERIMETER.md](docs/SECURITY_PERIMETER.md) — trust boundaries and single-authority design.
- [docs/CODEX_REVIEW.md](docs/CODEX_REVIEW.md) — after-CI-green exact-SHA specialist review handoff.
- [docs/POC_V0_1_REFERENCE.md](docs/POC_V0_1_REFERENCE.md) — detailed historical README for the earlier *local* JavaScript POC; **source not yet in this GitHub repository**.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — repeatable agent workflow / handoff protocol.

These documentation files establish a shared foundation. They do not constitute completion of the implementation.

## Approved technology / implementation still phased

Use an approved **TypeScript / Node.js / npm** development toolchain and target **Cloudflare Workers** for a small remote HTTPS MCP service. Keep ClickUp REST access in a small isolated adapter; use an established MCP SDK and an OAuth implementation compatible with both ChatGPT and Claude. Keep the server provider-neutral: **one MCP service, two subscription clients**. Use GitHub for source control and CI, not as a permanent web server.

Why npm? Node is the runtime; npm installs and locks dependencies and runs scripts; `npx` runs package executables. No separate AI API key or model API billing is required for *interactive calls from the supported subscription interfaces*. Deployment, ClickUp access and AI usage-plan restrictions remain separate.

The TypeScript/npm/Cloudflare stack was approved on 2026-10-10. Phase 2 uses the **official MCP SDK 2.3.1** and an authentic npm lockfile; OAuth, live ClickUp reads, cloud deployment and user-specific authorization are **not yet implemented**. The target is 2–4 separately authenticated NeonSales staff using their own ChatGPT/Claude subscriptions. The older local starter was dependency-free JavaScript with Node's test runner and is retained only as a reference; importing it is a separate reviewed step.

## Phase 2 commands and verification

For the code in [draft PR #3](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3):

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

The Worker rejects `/mcp` when the Phase 3 OAuth deployment bindings are missing; when configured, Cloudflare's official OAuthProvider guards the genuine SDK endpoint. **No deployed endpoint, real user sign-in or real ClickUp operation is claimed.** Phase 3 adds the `@cloudflare/workers-oauth-provider` module and tests, with 2–4 independent numeric GitHub staff IDs verified against an allowlist. See `docs/PROJECT_STATE.md` for current SHA and CI evidence.

## Planned capabilities (not all implemented)

- `connection_check`: identify configured environment and live/synthetic provenance.
- `find_tasks`, `get_task`: bounded read-only lookup within allowed ClickUp scope.
- `get_attention_report`: report overdue and >48-hour metadata-inactive tasks; disclose pagination limits.
- `prepare_test_task_update`: create an immutable proposed change for one designated disposable test task.
- `commit_approved_test_update`: commit only a separately approved proposal; never grant approval based solely on an LLM request.

**Approval is enforced by the backend**, not merely by prompt wording. Production updates remain disabled until a separate security and authorization review.

## Security principles

Never commit or paste real ClickUp tokens, OAuth client secrets, admin approval tokens, customer personal information, `.env` files, or worker secrets. Use deployment secrets and minimal permissions. Require authenticated MCP requests, server-side Workspace/List allowlisting, validation, bounded pagination, least-privilege writes, replay protection, logging without secrets, and explicit error reporting. A private GitHub repository **does not** make a publicly deployed MCP endpoint private.

A rate limit of 100 ClickUp REST requests/minute/token on Free Forever is distinct from the hosted ClickUp MCP daily allowance; it is **not** unlimited access. Handle 429, retries and partial results safely. See https://developer.clickup.com/docs/rate-limits.

## How we collaborate

At the beginning of each development session, read `AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and the relevant spec/plan. At the end, record what changed, the verification run, blockers and the exact next task in `docs/PROJECT_STATE.md`; cite commit IDs. Do not report a feature as working without a fresh test against the appropriate environment.

**Milestone order:** documentation and agreement → isolated read-only ClickUp integration → deploy + OAuth → test Claude connector and ChatGPT plugin → approval-gated disposable task write → review evidence → management demonstration. A 24-hour target is an aspiration, not proof of completion.

## Official reference material

- ClickUp REST API rate limits: https://developer.clickup.com/docs/rate-limits
- ClickUp filtered Workspace tasks: https://developer.clickup.com/reference/getfilteredteamtasks
- ChatGPT custom MCP server: https://developers.openai.com/api/docs/guides/custom-mcp-server
- ChatGPT personal plugin quickstart: https://developers.openai.com/plugins/quickstart
- Claude remote MCP connector: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Cloudflare remote MCP: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- MCP specification: https://modelcontextprotocol.io/specification

**Intended audience:** NeonSales technical owner and authorized developers. No permission is implied to modify the production ClickUp Workspace or to publish confidential records.
