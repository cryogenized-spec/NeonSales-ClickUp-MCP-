# Project state — single-source handoff

**Checkpoint:** 2026-10-10 SAST (minute not independently measured).
**Current phase:** Phase 2 SDK foundation — code updated for one Codex P2 acceptance finding; corrected test commit CI green, **final handoff-documentation SHA still requires its own fresh CI before re-review**.
**Repository:** `cryogenized-spec/NeonSales-ClickUp-MCP-` (GitHub Free; private).
**Pull requests:** [#1 Standards](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/1) → [#2 Perimeter](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/2) → [#3 Phase 2](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3). All **DRAFT, STACKED, NOT MERGED**.

## Implementation inventory

- `package.json` + **npm-registry-generated** `package-lock.json`, exact dependency versions. No fabricated lockfile. One-time privileged lockfile/formatter workflows were deleted after use.
- `src/mcp/create-server.ts`: official **`@modelcontextprotocol/server@2.3.1`**, static `service_info` tool with official `fromJsonSchema` closed object schema. No ClickUp API or secrets.
- `src/mcp/handler.ts`: official stateless SDK `createMcpHandler`, **in-process test only**. Supports modern 2026-07-28 and compatible legacy clients under SDK behavior.
- `src/index.ts`: public Worker **denies every /mcp method (503)** until OAuth exists, and 404 elsewhere. No hidden test bypass.
- `tests/mcp.test.ts` + `tests/worker.test.ts`: official SDK client modern/legacy calls, negative arguments, four concurrent protocol clients, four forged concurrent HTTP users, forbidden methods/paths, and four raw HTTP regression cases for malformed JSON, missing tool, unsupported version and mismatched version. This is **NOT evidence four users have authenticated**.
- TypeScript 6, ESLint, Prettier, Vitest 5 and Wrangler Cloudflare **dry-run**. No actual deploy.
- Dated phase design and plan in `docs/superpowers/`. Eight-step roadmap and exact-SHA Codex request process in `docs/phases/ROADMAP.md`, `docs/CODEX_REVIEW.md`.

## Fresh external CI evidence (code correction)

- **Latest corrected code CI:** [run 38059463499](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38059463499), `quality` **SUCCESS**, SHA `e77bfc18b4ed83d6a508bde8f37beebc6e627627`. Ran policy and Python regressions, pinned npm install, Prettier, ESLint, strict TypeScript, **15/15 Vitest tests**, Wrangler dry-run, and high-severity dependency audit.
- **Codex's Phase 2 review (old SHA `0f444fb`):** one P2 finding in `tests/mcp.test.ts`: required malformed JSON, unknown-tool and wrong-version raw protocol cases were missing. Remediation commit `a5f2db6` added four tests; formatting correction `e77bfc1` passed the full gate above. No MCP handler, Worker entrypoint, ClickUp API or OAuth behaviour was altered.
- Earlier successful [run 38054050247](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38054050247) covered 11 tests at SHA `0eb8fa96c13ad5dc14acb79da5b81d7e7a0e3124`. The initial test-change run failed Prettier and was corrected; no quality gate was disabled or waived.
- This **handoff documentation update** creates a new HEAD SHA, and requires its own completed green `quality` check before a fresh Codex request. That final SHA/run will be written in the PR review request rather than falsely predicted here.
- **Official MCP conformance runner / MCP Inspector:** NOT YET RUN. **Real authenticated remote transport:** NOT IMPLEMENTED.

## Identity, rate and security requirements

- **2–4 staff**, each using their own ChatGPT or Claude subscription. Phase 3 must independently authenticate each via MCP OAuth; no global principal, tool-supplied identity or shared customer chat account.
- One authorized ClickUp REST token may be shared behind per-person rights; its rate limit is **100/min/token** on Free Forever (not 100 per person). Phase 4 must have a cross-Worker coordinated budget, bounded retries, 429 and partial-result tests, not per-isolate optimistic counters.
- No production writes, no live ClickUp reads, no credentials and no hosted endpoint. Read-only first. Approval ledger needs independent human acceptance and atomic replay protection in Phase 6.
- Private GitHub **Free does not technically enforce required checks**. Human owner must inspect green CI on exact SHA and independently authorize merges. No autonomous merging or production deployment.

## Review state

- PRs #1 and #2 remain separate foundation/architecture reviews. PR #3 is still a stacked **draft**, unmerged.
- **Codex reviewed** [PR #3](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3) on SHA `0f444fb` (2026-10-10), raised one P2 test-coverage finding. The regression suite has been corrected and mechanically verified; this is **not** a Codex approval of the new HEAD.
- Ask for ONE fresh read-only Codex review on the final corrected HEAD **only after exact-SHA CI is successful**. Preserve the existing structured request in `docs/CODEX_REVIEW.md`. Address fresh findings before any owner merge decision.
- No waiver for Critical or Important findings. Human owner retains merge authority.

## Next exact action

1. Verify the final handoff-documentation HEAD against the successful `quality` run, and ensure PR #3 has not advanced to a different SHA.
2. Reply to the P2 review thread with correction and green CI evidence; request a scoped read-only `@codex review` on that exact HEAD SHA with base SHA, spec and the passing run URL.
3. Continue stacked draft PR review and human merge gates. **Do not** start Phase 3, touch ClickUp production, or deploy without owner authorization.
