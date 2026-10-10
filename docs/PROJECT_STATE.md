# Project state — canonical agent handoff

**Checkpoint:** 2026-10-10 (SAST; precise update time not recorded).
**Phase:** Phase 1 perimeter documented + CI-tested on stacked draft PR; **application deployment:** none. PR #1 (standards) remains unmerged.
**Repository:** `cryogenized-spec/NeonSales-ClickUp-MCP-`, private, default branch `main`.

## Confirmed in this repository

- Repository was empty at beginning of this documentation session.
- `README.md` introduced project objective, nonclaims, draft architecture, subscription tests and reference documents.
- `docs/POC_V0_1_REFERENCE.md` preserves the previous POC operating README as **archived guidance only**; source still outside GitHub.
- `AGENTS.md` establishes agent startup, security, review, testing and handoff rules.
- `CLAUDE.md` will point Claude at the same source of truth.
- Owner explicitly accepted TypeScript/npm/Cloudflare Workers, official MCP SDK v2, modular boundaries and strict CI on 2026-10-10. Detailed application feature design and deployment are **not approved**.

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

## Standards foundation in review (branch `chore/standards-skills-ci`)

- Root `AGENTS.md` revised to be a short OpenAI/AAIF AGENTS.md-compatible map with concrete startup/CI commands.
- Six *verbatim*, professional Superpowers `SKILL.md` files vendored in `.agents/skills/`, pinned to `obra/superpowers@bb92a77741419a4ab5f06e711a283343f1ada0c3`; upstream MIT licence and source blob hashes recorded. Their activation in every client is **not automatic**.
- `docs/MCP_COMPLIANCE.md`: official MCP spec **2026-07-28**, TypeScript SDK v2 and official conformance required; nothing has passed conformance yet.
- `docs/MODULARITY.md` sets module boundaries; `docs/BRANCH_PROTECTION.md` documents GitHub private-plan enforcement limitations.
- `.github/workflows/strict-ci.yml` + `scripts/check_repo_policy.py`: policy/skill checksum checks and conditional fail-closed npm quality checks once app code exists. `.github/CODEOWNERS` and Dependabot added. **CI result and branch protections not yet verified in this checkpoint.**
- Existing JS v0.1 remains outside GitHub as reference.

## Approved technical direction; implementation details still require design review

- Single provider-neutral remote Streamable HTTP MCP service on Cloudflare Workers, with HTTPS and proper OAuth.
- TypeScript + npm + Wrangler for the new implementation, using established SDKs where feasible; compare with retaining original no-dependency JavaScript starter before migrating.
- Isolated ClickUp REST adapter and business logic. Read-only first; only a disposable test task can be changed after independently enforced approval.
- GitHub hosts code/CI, not a persistent runtime. One deployment serves both ChatGPT plugin and Claude connector.
- No extra AI model API subscription required for successful interactive connector calls, subject to platform availability and usage limits.
- Do not commit credentials. Prefer OAuth per employee once staff rollout is in scope.

## Decisions and open issues

1. **Approved:** Cloudflare Workers, TypeScript/npm, official MCP SDK v2; detailed architecture, exact dependencies and OAuth configuration still need an accepted spec.
2. **Owner review needed:** confirm POC initially single-operator and one approved ClickUp List; employee-level OAuth later.
3. Verify the two subscription-account UIs and the authentication flows on actual accounts before assuming feature availability.
4. Define and approve exact read-only tools and report semantics; decide what the test task and change fields will be.
5. Import the old POC code **only after** plan approval and secret/quality review.

## Current pull request and CI evidence

- **PR:** [#1 — standards, upstream skills, strict CI](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/1), `chore/standards-skills-ci`, **DRAFT; not merged to main**.
- **Latest verified GitHub Actions run:** [run 38048875051](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38048875051), for commit `018ba48d0710898c3e92bfc2b7c194945c519681`. Job `quality` **SUCCESS**; repository integrity and 6 Python policy regression tests passed, including intentionally corrupted skill, package lockfile absence and TypeScript suppression.
- This was a **documentation-only** run: npm lint, TS checking, build, audit and MCP conformance correctly skipped. **Branch ruleset still NOT configured or verified**. The GitHub plan must permit enforcement for a private repository.
- Six vendored upstream skills **plus seven required supporting/licence files** are tracked and protected by 14 exact upstream Git blob hashes; no custom skills written.
- Future changes to this checkpoint will create a new commit and require a new green PR run. Do not report the previous run as testing commits made afterward.

## Phase 1 perimeter on stacked PR #2 (2026-10-10 SAST)

- PR: [#2](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/2); branch `phase/01-perimeter`; **base is `chore/standards-skills-ci`, not main**. PRs #1 and #2 are both draft and unmerged.
- Files: `docs/phases/ROADMAP.md`, `docs/CODEX_REVIEW.md`, `docs/SECURITY_PERIMETER.md`, dated Phase 1 spec and plan; AGENTS/CLAUDE/README/WORKFLOW/DECISIONS/BRANCH_PROTECTION updated; Python guard requires these documents.
- **Test-first evidence:** [GitHub run 38050760855](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38050760855) failed as intended due to new mandatory-perimeter regression; after guard fix, [run 38050844108](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38050844108) succeeded on commit `de589d901c0f594ca6e83bc4ef87bfd3a80d7339`. A further checkpoint commit requires its own green run.
- **GitHub plan confirmed Free:** private branch rules are NOT enforceable here; therefore the owner must inspect exact SHA and CI manually. Do not claim guaranteed inability to bypass.
- **Codex review:** Rule documented; **not requested** on documentation-only PR. For code-bearing phases request one focused review only after green CI for the current SHA and an actual connected Codex review app. Codex setup/invocation has not been verified.
- Review lessons from `Elara-Relay`: evidence before PASS; distinguish trusted authority from adapter; exact SHA; review in isolation; no monolithic copying. No Elara product code copied.
- TS/npm app scaffold and real MCP SDK code still **not built**; npm registry access unavailable from current local runtime, so no fabricated lockfile. A later reviewed phase must generate an authentic npm lockfile and run all TS gates.

## Next exact action

**Verify the newest PR #2 HEAD_SHA receives green `quality` after this state edit.** Ask the owner to inspect PRs #1 and #2 in order; do not merge automatically. Then Phase 2 begins only upon a new reviewed, dated spec/plan: authentic npm lockfile, real official SDK v2 TypeScript server, transport discovery and negative tests, with no ClickUp credentials. Use ROADMAP.md and CODEX_REVIEW.md. The first code-bearing Phase 2 PR must reach green TS CI before any Codex review request.

## Latest documentation evidence

GitHub connector writes verified during 2026-10-10: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_STATE.md`, `docs/ARCHITECTURE_PROPOSAL.md`, `docs/DECISIONS.md`, `docs/DEMO_ACCEPTANCE.md`, `docs/WORKFLOW.md`, `docs/POC_V0_1_REFERENCE.md`. Recent commits include `5e2c41243a75993ae8e23a16d3d3a395c7467017` (WORKFLOW), `ad883e315ef3bf28eeac148010f38ff1ce31087e` (archived POC reference), and the README link update after those commits. All are documentation changes, not runtime code.

**Session close protocol:** replace only the *checkpoint/verified status/next action* with fresh evidence; keep historical decisions in DECISIONS.md and dated specs. Never invent missing verification.
