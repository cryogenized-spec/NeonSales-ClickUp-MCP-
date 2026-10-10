# Project state — single-source handoff

**Checkpoint:** 2026-10-10 SAST (minute not independently measured).
**Current phase:** Phase 2 SDK foundation — CODE IMPLEMENTED / CI GREEN on pre-checkpoint SHA; **final documentation SHA still requires fresh CI**.
**Repository:** `cryogenized-spec/NeonSales-ClickUp-MCP-` (GitHub Free; private).
**Pull requests:** [#1 Standards](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/1) → [#2 Perimeter](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/2) → [#3 Phase 2](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3). All **DRAFT, STACKED, NOT MERGED**.

## Implementation inventory

- `package.json` + **npm-registry-generated** `package-lock.json`, exact dependency versions. No fabricated lockfile. One-time privileged lockfile/formatter workflows were deleted after use.
- `src/mcp/create-server.ts`: official **`@modelcontextprotocol/server@2.3.1`**, static `service_info` tool with official `fromJsonSchema` closed object schema. No ClickUp API or secrets.
- `src/mcp/handler.ts`: official stateless SDK `createMcpHandler`, **in-process test only**. Supports modern 2026-07-28 and compatible legacy clients under SDK behavior.
- `src/index.ts`: public Worker **denies every /mcp method (503)** until OAuth exists, and 404 elsewhere. No hidden test bypass.
- `tests/mcp.test.ts` + `tests/worker.test.ts`: official SDK client modern/legacy calls, negative arguments, four concurrent protocol clients, four forged concurrent HTTP users, forbidden methods/paths. This is **NOT evidence four users have authenticated**.
- TypeScript 6, ESLint, Prettier, Vitest 5 and Wrangler Cloudflare **dry-run**. No actual deploy.
- Dated phase design and plan in `docs/superpowers/`. Eight-step roadmap and exact-SHA Codex request process in `docs/phases/ROADMAP.md`, `docs/CODEX_REVIEW.md`.

## Fresh external CI evidence (pre-checkpoint)

- **GitHub Actions `quality`: SUCCESS** [run 38054050247](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38054050247), on SHA `0eb8fa96c13ad5dc14acb79da5b81d7e7a0e3124`.
- Actual checks: dependency install `npm ci --ignore-scripts`, Prettier, ESLint, `tsc --noEmit` (strict), **11/11 Vitest tests**, Cloudflare Wrangler dry-run build, `npm audit --audit-level=high` (PASS), policy integrity and Python regression tests.
- **Adversarial failures found and fixed without bypass:** old TypeScript ESLint peer incompatible with TS6, old schema interface TS2769, mistaken escaped-JSON assertion, vulnerable Wrangler/miniflare/undici/sharp transitive dependency. Each was observed in actual failing CI and corrected. No `--force`, `--legacy-peer-deps` or suppressed audit.
- A README/state edit after this SHA **requires a NEW green run** before Codex review or approval. Do not cite the older run as coverage of new code.
- **Official MCP conformance runner / MCP Inspector:** NOT YET RUN. **Real authenticated remote transport:** NOT IMPLEMENTED.

## Identity, rate and security requirements

- **2–4 staff**, each using their own ChatGPT or Claude subscription. Phase 3 must independently authenticate each via MCP OAuth; no global principal, tool-supplied identity or shared customer chat account.
- One authorized ClickUp REST token may be shared behind per-person rights; its rate limit is **100/min/token** on Free Forever (not 100 per person). Phase 4 must have a cross-Worker coordinated budget, bounded retries, 429 and partial-result tests, not per-isolate optimistic counters.
- No production writes, no live ClickUp reads, no credentials and no hosted endpoint. Read-only first. Approval ledger needs independent human acceptance and atomic replay protection in Phase 6.
- Private GitHub **Free does not technically enforce required checks**. Human owner must inspect green CI on exact SHA and independently authorize merges. No autonomous merging or production deployment.

## Review state

- PRs #1 and #2 remain separate foundation/architecture reviews.
- **Codex specialist review:** Await verified green final HEAD_SHA of PR #3; then a **single** `@codex review` request with precise scope, if Codex cloud is enabled for the repo. A posted comment does not prove Codex accepted or completed the review.
- No waiver for Critical or Important findings. Rerun all checks after any fix.

## Next exact action

1. Verify the GitHub `quality` job for **the final Phase 2 documentation commit**, recording current HEAD_SHA and run ID without guessing.
2. If green, issue a single focused Codex PR #3 review request, verify actual acknowledgment/review. Do **not** start Phase 3 until PR #3 and preceding stacked PRs are reviewed/merged or the owner explicitly chooses to continue stacked.
3. Phase 3 design: remote Worker OAuth with a real provider, login/scopes for four distinct staff, denial of cross-user access, per-request identity, proper resource metadata and subscription compatibility. No real ClickUp data until identity gates are green.
