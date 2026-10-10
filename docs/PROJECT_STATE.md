# Project state — canonical handoff

**Checkpoint:** Saturday 2026-10-10, SAST (minute not independently verified).
**Current work:** Phase 3 individual staff OAuth implementation, draft PR [#4](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/4) on `phase/03-oauth-identity`; base is `phase/02-sdk-foundation`, not `main`.
**Review/merge:** PR [#1](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/1) → [#2](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/2) → [#3](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3) → [#4](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/4) are **stacked drafts**, not merged. GitHub Free private repo: CI is not technically enforced by branch protection; human manually approves merges. PR #3's four missing malformed-frame regressions are now incorporated by the conflict-resolution merge into the isolated Phase 3 integration candidate. Do not mutate the foundation PR.

## Verified implementation inventory

- **Phase 2 SDK base**: official `@modelcontextprotocol/server@2.3.1`, diagnostic `service_info`; stateless in-process SDK transport. No real ClickUp reads or writes.
- **Phase 3 OAuth provider**: official `@cloudflare/workers-oauth-provider@1.2.3` guards `/mcp`, resource metadata/client registration/PKCE grant lifecycle and token verification. `src/auth/oauth-runtime.ts` requires a verified `ctx.auth` matching the user ID in grant props and checks the current allowlist on every invocation.
- **Identity adapter**: GitHub OAuth App `/authorize` consent → PKCE-bound upstream GitHub login → `/github/callback` → authenticated `GET /user` immutable numeric ID → up to four unique `github:<id>` staff members. This is a POC identity choice: employees need separate GitHub logins in addition to their own ChatGPT/Claude subscriptions. No shared chatbot account.
- **Security**: browser-bound Cloudflare consent/upstream state helpers, escaping user-controlled client metadata, reject forged/expired IDs and missing/invalid token scope. `global_fetch_strictly_public` enables SSRF restrictions for CIMD. No `/mcp` when secrets/KV are unconfigured. No ClickUp keys, production changes, OAuth test backdoors or public deployments.
- **Build**: exact npm-generated lockfile, no temporary write-privileged workflow retained. Three compiler checks: `tsconfig.auth.json` and `tsconfig.mcp.json` each `skipLibCheck:false` plus full app `strict:true` with `skipLibCheck:true` **only to resolve colliding third-party Cloudflare and Node declarations**. Repository policy now requires all three checks and Phase 3 documents.
- **Testing**: 44 deterministic Vitest tests, including 4 simultaneous staff identities, forged forwarded-host/ID, removed/duplicate/invalid users, network/upstream identity failures, HTML injection, unauthenticated Worker rejection, MCP tools. Tests use fixtures. No real token or multi-user subscription sessions.

## Fresh CI evidence (before last policy/documentation commit)

- [GitHub Actions #38061252610](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38061252610) at `2c91d62f2e4fc94b4cb6a359262fbf466f4ded08`: **quality SUCCESS**, 44/44 Vitest, npm ci, Prettier, ESLint, all three typechecks, Worker dry-run, npm audit 0 vulnerabilities and policy regression suite.
- After that run, additional README, specs, repository policy and checkpoint updates were made. They require **new CI on the final PR #4 HEAD**; the above run is not evidence of later commits. Policy TDD red: [run #38061621439](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38061621439) failed on the intentionally added Phase3 required-docs assertion, followed by repository policy implementation.
- **Unverified:** Actual Cloudflare KV bindings/secrets, deployed HTTPS Worker and 401 challenge, GitHub OAuth app and browser login, token revocation in a real environment, OAuth conformance test, ChatGPT personal Plugin and Claude remote connector invocations, 4 real signed-in staff, ClickUp API and shared request budget. Do not claim Phase 3 live acceptance or final MCP compliance.

## Phase 3 consent-scope adversarial hardening (2026-10-10 SAST)

- **Scope:** Separate PR #4 only; no edits to Phase 2 (#3) or other agent's modernization PR #5. The Phase 3 integration candidate includes the corrected Phase 2 protocol regressions; original Phase 3 is updated only following a verified conflict-free merge and safe coordination.
- **Root cause:** `submitConsent` previously forwarded all browser-submitted `scope` values directly to Cloudflare's consent helper, and Phase 3 advertised `offline_access` although it never issued that scope. A Node unit test importing the full handler also hit the Cloudflare-only `cloudflare:` module loader; testing was moved to a pure policy boundary.
- **RED evidence:** [Actions #38066101760](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38066101760), 5 expected failing scope-policy tests, 41 others passing. Earlier run #38066003572 failed at import boundary, **not** as evidence of a policy failure.
- **GREEN evidence before this checkpoint:** [Actions #38066186197](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38066186197) for commit `0cb51d69b2f295a124801a3630165a3a120bd708`: 46/46 Vitest, strict three-part TypeScript checks, Prettier, ESLint, Wrangler dry-run and `npm audit --audit-level=high` (0 vulnerabilities) all SUCCESS.
- **Fix:** `validatedReadOnlyScopes` rejects unknown, duplicated or empty browser scopes. `submitConsent` returns 400 **before consuming the browser-bound approval handle**. Provider currently advertises only `mcp:read`; refresh/offline authorization is deliberately not claimed in Phase 3.
- **Remaining warning:** Build emitted Node's `url.parse()` deprecation warning from a dependency/runtime path, despite a clean npm audit. Review with toolchain modernization; no waiver/suppression applied.
- **CI-only PR:** [#6](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/6) targeted main solely to trigger exact-SHA Actions. It must be closed **without merging** after the final checkpoint commit receives its own successful run.
- **Codex:** PR #4 previously received “create an environment for this repo”, not a completed review. Other agent handles Codex setup/remediation; do not consume duplicate pings. No production deployment or live OAuth checks.
- **Final checkpoint caveat:** This documentation change advances HEAD beyond the green SHA above. Verify **latest HEAD** against a new green Actions run before treating PR #4 as mechanically green.

## Canonical instructions and specifications

- `AGENTS.md` + `CLAUDE.md`: agent instructions and code/test commands.
- `docs/phases/ROADMAP.md`: phases 0–7 and review gates.
- `docs/MCP_COMPLIANCE.md`: MCP protocol requirements and nonclaims.
- `docs/superpowers/specs/2026-10-10-phase3-auth-design.md` and `docs/superpowers/plans/2026-10-10-phase3-auth.md`: Phase 3 design and test-first implementation plan.
- `docs/PHASE3_SETUP.md`: **manual** Cloudflare KV, GitHub OAuth App, Worker secret, custom hostname, account test and OAuth acceptance steps. No secrets in repository/chat.
- `docs/CODEX_REVIEW.md`: require green CI at exact current HEAD before **one** specialist `@codex review`; requesting a review is not completing it.

**GitHub Actions trigger note:** Previous formatter/workflow-bot commits may not trigger a new PR workflow automatically. This human-authorized connector commit intentionally requests fresh CI against the new HEAD. Do not cite any earlier green run as verifying it.

## Next exact action

1. Run/retrieve GitHub Actions `quality` on the final PR #4 SHA, then close temporary PR #6 without merging. Verify policy guard, 7 Python regressions, 44 Vitest tests, three TypeScript checks, build, format, lint and audit.
2. If **all green on exact final SHA**, post ONE scoped Codex review request on PR #4 with that SHA/run. Examine actual reply and remediate Important/Critical findings after further green CI; no duplicate pings.
3. Owner manually reviews stacked PRs; verify merged Phase 2 and Phase 3 code plus preserved staff isolation against the exact integration SHA before moving PR #4.
4. For live end-to-end Phase 3 verification, authorized operator must provision Cloudflare Worker HTTPS test hostname/KV/GitHub OAuth App (exact callback), store Worker secrets, use four separate accounts, test token audience/PKCE/revocation and both subscription UIs. No production task access until these checks are passed.

## Phase 2 / Phase 3 conflict-resolution checkpoint (2026-10-10 SAST)

- Integration branch `integration/phase2-oauth-merge-20261010` uses **both** corrected Phase 2 parent `b62d3a438ee5816adc1ae730a94d7cae2e3f8fbf` and Phase 3 OAuth parent `1afe8498547d083a986c37d6e995a1ffc6bd65f0`. The merge retains all Phase 3 OAuth sources, scoped consent verification, Cloudflare Worker bindings, per-staff GitHub identity, and its test/toolchain manifests.
- Conflict resolution: `tests/mcp.test.ts` is restored verbatim from the reviewed Phase 2 foundation; this adds FOUR raw negative MCP transport regressions without deleting Phase 3's 46 authentication tests. This handoff doc retains the advanced Phase 3 checkpoints and adds the foundation resolution. No npm lockfile splicing, no runtime secrets.
- **Do not merge PR #5 here.** Its npm 12.2.0 CLI bundles have a confirmed upstream vulnerability and its supply-chain CI gate currently intentionally fails. OAuth integration stays on its approved npm 10/Node 22 base until the modernization branch is independently corrected and approved.
- The target architecture remains **2–4 independently authenticated staff members**, ChatGPT/Claude integration against one protected MCP backend, server-side ClickUp rights, shared token budget and manual approval before production writes. Real account OAuth/client-conformance checks and Cloudflare provisioning remain outstanding.
- Fresh normal CI on the **exact merge commit** is mandatory before any green/mergeability claim. Test completion alone does not approve deployment or human merge. PRs #1–#4 remain drafts.
