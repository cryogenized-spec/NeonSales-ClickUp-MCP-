# Project state — canonical agent handoff

**Checkpoint:** 2026-10-10 (SAST; precise update time not recorded).
**Phase:** 0 — planning/repository documentation. **Application deployment:** none.
**Repository:** `cryogenized-spec/NeonSales-ClickUp-MCP-`, private, default branch `main`.

## Confirmed in this repository

- Repository was empty at beginning of this documentation session.
- `README.md` introduced project objective, nonclaims, draft architecture, subscription tests and reference documents.
- `docs/POC_V0_1_REFERENCE.md` preserves the previous POC operating README as **archived guidance only**; source still outside GitHub.
- `AGENTS.md` establishes agent startup, security, review, testing and handoff rules.
- `CLAUDE.md` will point Claude at the same source of truth.
- Design and technology selections below are **proposals**, not implementation approval.

## Prior local reference POC (outside this repo)

- Source archived in earlier ChatGPT conversation as `neonsales-clickup-mcp-poc-v0.1.zip`; **not imported here**. If unavailable to a new agent, request the archive or reconstruct only after approval.
- Local JavaScript POC supports synthetic MCP calls and mocks of ClickUp REST operations and a test-task approval proposal flow. It is **not deployed** and hasn't accessed NeonSales production records.
- **Fresh local verification in the documentation session on 2026-10-10:** `npm test` ran on the unpacked reference directory; result **12/12 tests passing**, including synthetic mode, unauthorized requests, pagination, allowlists and simulated approval. This does not verify actual ClickUp, remote OAuth or subscription UIs.

## Acceptance state

| Check | Status |
|---|---|
| Local POC automated unit/integration mocks | PASS (12/12, reference folder only) |
| Local POC HTTP/MCP smoke test | PRIOR SESSION REPORTED PASS; not re-run in current docs session |
| Real ClickUp live read and data comparison | NOT TESTED |
| Cloud deployment and OAuth from both clients | NOT TESTED |
| ChatGPT plugin actual subscription tool invocation | NOT TESTED |
| Claude custom connector actual subscription tool invocation | NOT TESTED |
| Real disposable test-task write with separate approval | NOT TESTED |
| Security review, logs, authorization and throttling | NOT COMPLETE |

## Proposed technical direction — review required

- Single provider-neutral remote Streamable HTTP MCP service on Cloudflare Workers, with HTTPS and proper OAuth.
- TypeScript + npm + Wrangler for the new implementation, using established SDKs where feasible; compare with retaining original no-dependency JavaScript starter before migrating.
- Isolated ClickUp REST adapter and business logic. Read-only first; only a disposable test task can be changed after independently enforced approval.
- GitHub hosts code/CI, not a persistent runtime. One deployment serves both ChatGPT plugin and Claude connector.
- No extra AI model API subscription required for successful interactive connector calls, subject to platform availability and usage limits.
- Do not commit credentials. Prefer OAuth per employee once staff rollout is in scope.

## Decisions and open issues

1. **Owner review needed:** confirm Cloudflare Workers + TypeScript/npm vs simple JavaScript Worker vs alternative hosting.
2. **Owner review needed:** confirm POC initially single-operator and one approved ClickUp List; employee-level OAuth later.
3. Verify the two subscription-account UIs and the authentication flows on actual accounts before assuming feature availability.
4. Define and approve exact read-only tools and report semantics; decide what the test task and change fields will be.
5. Import the old POC code **only after** plan approval and secret/quality review.

## Next exact action

**Review [docs/ARCHITECTURE_PROPOSAL.md](ARCHITECTURE_PROPOSAL.md) and [docs/DECISIONS.md](DECISIONS.md) with the owner.** Get explicit approval or revisions. Then write a dated design spec under `docs/superpowers/specs/` and a test-first implementation plan under `docs/superpowers/plans/`; no application-code import yet.

## Latest documentation evidence

GitHub connector writes verified during 2026-10-10: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_STATE.md`, `docs/ARCHITECTURE_PROPOSAL.md`, `docs/DECISIONS.md`, `docs/DEMO_ACCEPTANCE.md`, `docs/WORKFLOW.md`, `docs/POC_V0_1_REFERENCE.md`. Recent commits include `5e2c41243a75993ae8e23a16d3d3a395c7467017` (WORKFLOW), `ad883e315ef3bf28eeac148010f38ff1ce31087e` (archived POC reference), and the README link update after those commits. All are documentation changes, not runtime code.

**Session close protocol:** replace only the *checkpoint/verified status/next action* with fresh evidence; keep historical decisions in DECISIONS.md and dated specs. Never invent missing verification.
