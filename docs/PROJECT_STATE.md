# Current checkpoint — complete ClickUp model-facing schemas (11 October 2026 SAST)

**Draft PR #19**: [Full MCP schema](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/19) on `feature/phase4-full-mcp-tool-schemas-20261011`, stacked only on the isolated read-only POC [PR #17](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/17). No merges, no live secret changes and no deployment.

**Completed code milestone:** The configured official MCP SDK v2 server registers 52 tool contracts: 3 operational (but separately secret/grant-gated) scoped read tools, 47 full input/output schema-only no-op capability contracts based on the 48 published ClickUp MCP capability areas, diagnostic `service_info`, and read-only `get_tool_catalog` availability discovery. ClickUp's Get Task is represented by the existing `get_scoped_task` home-List-limited read. Tool names, titles, action/risk descriptions, closed JSON input schemas and output contracts are in `src/mcp/`; model-facing guidance is in [FULL_TOOL_SCHEMA.md](FULL_TOOL_SCHEMA.md).

**Evidence:** Strict CI [run #38131543918](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38131543918) passed at code SHA `c02531a5c61a94f4c5e7996e08386430bcfe3868`: 114/114 Vitest tests over 11 test files, 9 Python policy regressions, npm lockfile install, Prettier, ESLint, three strict TypeScript profiles, Wrangler dry-run, genuine local workerd OAuth smoke, and `npm audit` zero vulnerabilities. **This earlier run is not evidence for any subsequent docs commits until their CI is green.**

**Live truth:** Planned operations are advertised for schema discovery only and always return `CLICKUP_TOOL_NOT_IMPLEMENTED`, including all writes/deletes. No planned callback contains a ClickUp API method. The three real read-only paths from PR #17 remain separately disabled without owner-configured grants/secrets. No real ClickUp data has been read by this Phase 4 branch. Full 52-tool discovery has been tested in the in-process official SDK, not from a deployed client subscription.

**Next:** Verify exact-final-SHA CI, then ask a focused Codex review of schema safety/outputs, protocol capability discovery and whether 47 disabled tools should remain visible to end-user clients. Keep PR #19 draft and unmerged; owner-controlled staging and future mutation design require separate decisions.

---

## Previous checkpoint (historical; superseded where inconsistent)


**Branch:** `feature/phase4-clickup-readonly-poc-20261011` (draft [PR #17](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/17)); stacked on Phase 3 security test branch from [PR #16](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/16), **not merged**.

**Verified evidence:** [Strict CI #38129729291](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38129729291) passed on commit `ffe0d690dfb1c298d30ca8cbc4cf64e4cf363f65`: 108 Vitest tests, nine repository-policy tests, strict triple TypeScript, formatting, ESLint, Wrangler build, workerd OAuth smoke and npm audit (zero vulnerabilities). **Any later commits require fresh CI; this older run does not certify them.**

**Implemented under separate owner-authorized development:** official MCP SDK registrations for `find_scoped_tasks`, `get_scoped_task` and `get_attention_report`; separate GitHub-ID read grant, server-only List ID, GET-only ClickUp REST adapter, conservative shared SQLite Durable Object quota, bounded pagination, 48h SAST attention report and synthetic adversarial tests. See [Phase 4 POC runbook](PHASE4_POC_SETUP.md).

**Live truth:** Earlier Phase 3 staging was independently reported in PR #15 as successfully authenticated from Claude with `service_info`. This does not mean Phase 3 revocation/conformance/multi-staff gates passed. **Phase 4 is not deployed or enabled, has no live ClickUp credential, has not read a ClickUp task through this server and has performed no write.**

**Pending:** Fresh final SHA CI, focused security review, owner-approved single test List + staff READ grant, isolated Cloudflare staging Durable Object migration and secret provisioning, and actual Claude task read/denial. Keep `CLICKUP_LIVE_ENABLED` unset until these approvals. Do not touch the production Worker, merge Phase 3 or merge Phase 4.

---

## Earlier checkpoint (historical; superseded where inconsistent)


**Checkpoint:** 2026-10-10 SAST (time not independently captured). **Current Phase 3:** draft PR [#4](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/4), now based on **main**.
**Merged foundation:** PRs [#1](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/1), [#2](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/2), and [#3](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/3) are already merged into main at commit `914c5e69e7366b465f823787225861c3ac40ad29`. Phase 4 design-only PR [#8](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/8) remains stacked on #4. Unsafe Node/npm modernization PR #5 is CLOSED without merge.
**Live release status:** NO GO. There is no verified Cloudflare staging account/Worker public HTTPS hostname, real KV namespace, GitHub OAuth App callback/credentials, live personal ChatGPT/Claude connections, or four distinct real employee sign-ins. **No ClickUp reads or production writes.**
**Merge gate:** Maintainer-authorized code merge may be considered separately from release, but current Phase 3 OAuth **live acceptance** is not complete. Do not claim live readiness, deploy or enable ClickUp without the staging runbook tests.

## Latest Phase 3 workerd security smoke (2026-10-10)

- Executable `scripts/staging-local-smoke.mjs` starts the **actual pinned Wrangler/workerd** over loopback-only HTTPS with an ephemeral, self-signed test certificate and **fake nonfunctional** GitHub OAuth app values. In-memory/local KV binding ID is never a real Cloudflare resource. It does NOT contact production services or require runtime secrets.
- CI now runs it after Wrangler build. Missing local KV -> fail-closed **503**. Proper local KV -> unauthenticated **401 Bearer OAuth challenge**; RFC 9728 protected-resource metadata and RFC 8414 authorization-server metadata discoverable with correct issuer, audience and `mcp:read`; forged bearer, spoofed headers and query bypass remain unauthorized.
- Verified first all-green integrated test [run #38081428776](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38081428776), SHA `3edb5e9ccdc0646d4a4cf5a72fac6582881c9258`. **56/56 Vitest**, 9 Python policy regressions, isolated Workerd smoke, strict triple TS, formatting, lint, reproducible Wrangler build and project high-severity npm audit all SUCCESS.
- First smoke run [#38081351855](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38081351855) was RED because pinned Wrangler CLI did not support a newer documented flag; test code was corrected without relaxing expected OAuth results. No production source files were changed.
- **Next action:** Verify quality on this documentation's exact new SHA; request a focused specialist review of the local HTTPS smoke (if final green), then request operator-provisioned isolated Cloudflare/GitHub OAuth staging and actual independent account tests. Do NOT merge and declare Phase 3 operational based on local tests alone.
- Historical handoff notes below describe earlier work and earlier commit states; where those statements conflict with this checkpoint, this current section is authoritative.

## Verified implementation inventory

- **Phase 2 SDK base**: official `@modelcontextprotocol/server@2.3.1`, diagnostic `service_info`; stateless in-process SDK transport. No real ClickUp reads or writes.
- **Phase 3 OAuth provider**: official `@cloudflare/workers-oauth-provider@1.2.3` guards `/mcp`, resource metadata/client registration/PKCE grant lifecycle and token verification. `src/auth/oauth-runtime.ts` requires a verified `ctx.auth` matching the user ID in grant props and checks the current allowlist on every invocation.
- **Identity adapter**: GitHub OAuth App `/authorize` consent → PKCE-bound upstream GitHub login → `/github/callback` → authenticated `GET /user` immutable numeric ID → up to four unique `github:<id>` staff members. This is a POC identity choice: employees need separate GitHub logins in addition to their own ChatGPT/Claude subscriptions. No shared chatbot account.
- **Security**: browser-bound Cloudflare consent/upstream state helpers, escaping user-controlled client metadata, reject forged/expired IDs and missing/invalid token scope. `global_fetch_strictly_public` enables SSRF restrictions for CIMD. No `/mcp` when secrets/KV are unconfigured. No ClickUp keys, production changes, OAuth test backdoors or public deployments.
- **Build**: exact npm-generated lockfile, no temporary write-privileged workflow retained. Three compiler checks: `tsconfig.auth.json` and `tsconfig.mcp.json` each `skipLibCheck:false` plus full app `strict:true` with `skipLibCheck:true` **only to resolve colliding third-party Cloudflare and Node declarations**. Repository policy now requires all three checks and Phase 3 documents.
- **Testing**: 56 deterministic Vitest tests plus isolated real workerd HTTPS security smoke; includes 4 simultaneous staff identities, forged headers/bearers, expired scopes, missing KV, OAuth challenge/metadata and real SDK callbacks. No real OAuth token or multi-user subscription sessions.

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

## Codex P1 remediation verified on code SHA (2026-10-10 SAST)

Review: https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/pull/4 (Codex reviewed merge `9b8d246e78`; two P1 findings).

1. **P1, OAuth provider does not initialize:** The pinned `@cloudflare/workers-oauth-provider@1.2.3` forbids using `requiredScopes` and legacy `resourceMetadata.scopes_supported` together. Removed the obsolete resource metadata scope; retain `scopesSupported: ["mcp:read"]` for the authorization server and `requiredScopes: ["mcp:read"]` for the resource. The first RED job, [#38071287920](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38071287920), reproduced the constructor conflict in an adapter fixture matching pinned provider behavior; the next RED [#38071356014](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38071356014) proved the configuration fix while exposing missing principal forwarding.
2. **P1, verified staff identity lost before tool dispatch:** `src/auth/oauth-runtime.ts` now consumes only `OAuthProvider`-verified `ctx.auth` and `ctx.props`, revalidates the active staff allowlist and `mcp:read`, and passes `authInfo` to the official SDK's `createMcpHandler().fetch(request, {authInfo})`. The per-request `AuthInfo` carries OAuth client ID, resource audience, expiry, least-privilege scope, bearer token and vetted `extra.subject` / `extra.githubId`. Forged headers are ignored; four concurrent user identities remain distinct. No global principal or fallback header identity.
3. **Additional expired-token defense:** An adversarial test proved that a stale context was incorrectly accepted ([RED #38071596569](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38071596569)). The Worker now checks expiry again before SDK dispatch. 
4. **Real SDK test:** A separate in-process official-MCP client/server integration verifies four concurrent tool callbacks see their own identities via `ctx.http.authInfo.extra["subject"]`. This **does not replace** real Cloudflare token verification or hosted ChatGPT/Claude subscriber tests.

**Last verified all-code CI (before this documentation commit):** [run #38072132875](https://github.com/cryogenized-spec/NeonSales-ClickUp-MCP-/actions/runs/38072132875), SHA `f3be787042af1a458c63cbb5f94fa7e687ba3fc8`, **SUCCESS**: 56/56 Vitest tests across 7 files, 9 Python policy regressions, Prettier, ESLint, three strict TS profiles, Wrangler dry-run, `npm audit --audit-level=high` (0 reported project dependency vulnerabilities). Node deprecation warnings remain; globally installed package-manager security is a separate gate, and vulnerable npm 12 PR #5 remains closed without merge.

**Temporary formatter CI:** A tightly scoped GitHub Actions formatter ran to normalize newly added regression tests and was then removed from the branch. No elevated workflow remains and no credentials were introduced.

**This checkpoint advances the PR SHA.** A new exact-HEAD quality SUCCESS is REQUIRED before requesting one scoped Codex re-review. PR #4 remains draft, structurally mergeable but not accepted for production or deployment.

## Next exact action

1. Confirm a new `quality` success on the latest PR #4 SHA after this documentation commit.
2. Reply to both original Codex P1 threads with verified resolution and request **one** focused read-only specialist re-review on the final green SHA; do not claim Codex approval without its actual response.
3. Preserve PR stack #1 → #2 → #3 → #4 and owner-controlled merge gate. PR #5/npm 12 modernization stays CLOSED while its global npm bundle audit is RED.
4. Complete real Cloudflare Worker + KV + GitHub OAuth App staging, token audience/PKCE/revocation testing, four separate staff logins and ChatGPT/Claude integration, followed by official MCP conformance, **before** any live ClickUp access or production deployment.

## Phase 2 / Phase 3 conflict-resolution checkpoint (2026-10-10 SAST)

- Integration branch `integration/phase2-oauth-merge-20261010` uses **both** corrected Phase 2 parent `b62d3a438ee5816adc1ae730a94d7cae2e3f8fbf` and Phase 3 OAuth parent `1afe8498547d083a986c37d6e995a1ffc6bd65f0`. The merge retains all Phase 3 OAuth sources, scoped consent verification, Cloudflare Worker bindings, per-staff GitHub identity, and its test/toolchain manifests.
- Conflict resolution: `tests/mcp.test.ts` is restored verbatim from the reviewed Phase 2 foundation; this adds FOUR raw negative MCP transport regressions without deleting Phase 3's 46 authentication tests. This handoff doc retains the advanced Phase 3 checkpoints and adds the foundation resolution. No npm lockfile splicing, no runtime secrets.
- **Do not merge PR #5 here.** Its npm 12.2.0 CLI bundles have a confirmed upstream vulnerability and its supply-chain CI gate currently intentionally fails. OAuth integration stays on its approved npm 10/Node 22 base until the modernization branch is independently corrected and approved.
- The target architecture remains **2–4 independently authenticated staff members**, ChatGPT/Claude integration against one protected MCP backend, server-side ClickUp rights, shared token budget and manual approval before production writes. Real account OAuth/client-conformance checks and Cloudflare provisioning remain outstanding.
- Fresh normal CI on the **exact merge commit** is mandatory before any green/mergeability claim. Test completion alone does not approve deployment or human merge. PRs #1–#4 remain drafts.
