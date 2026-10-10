# NeonSales ClickUp MCP — planning repository

**Project status:** Documentation and architecture-planning stage as of 2026-10-10 (South Africa Standard Time, UTC+02:00). This repository is **not** a deployed integration and contains **no application code yet**. A separate, local POC v0.1 archive was prepared during the earlier conversation; its code has not yet been imported to this repository.

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
- [docs/POC_V0_1_REFERENCE.md](docs/POC_V0_1_REFERENCE.md) — detailed historical README for the earlier *local* JavaScript POC; **source not yet in this GitHub repository**.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — repeatable agent workflow / handoff protocol.

These documentation files establish a shared foundation. They do not constitute completion of the implementation.

## Initial engineering proposal — subject to approval

Use a **TypeScript / Node.js / npm** development toolchain and target **Cloudflare Workers** for a small remote HTTPS MCP service. Keep ClickUp REST access in a small isolated adapter; use an established MCP SDK and an OAuth implementation compatible with both ChatGPT and Claude. Keep the server provider-neutral: **one MCP service, two subscription clients**. Use GitHub for source control and CI, not as a permanent web server.

Why npm? Node is the runtime; npm installs and locks dependencies and runs scripts; `npx` runs package executables. No separate AI API key or model API billing is required for *interactive calls from the supported subscription interfaces*. Deployment, ClickUp access and AI usage-plan restrictions remain separate.

This stack is **proposed, not approved**. The older local starter was dependency-free JavaScript with Node's test runner and is retained only as a reference; importing it is a separate reviewed step.

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
