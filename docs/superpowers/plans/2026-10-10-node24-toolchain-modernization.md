# Node 24 / npm 12 toolchain modernization — execution and rollback

**Date:** 2026-10-10 SAST. **Authorization:** owner requested implementation of the reviewed toolchain upgrade plan.
**Scope:** compatibility-preserving dependency and CI refresh, stacked on Phase 2. **Not** Phase 3 OAuth, ClickUp requests, a new public endpoint or deployment.

## Baseline and dependency policy

- Base: Phase 2 draft PR #3 at `b62d3a438ee5816adc1ae730a94d7cae2e3f8fbf`, with 15 MCP/Worker regression cases.
- Target runtime: Node **24.21.0** Active LTS via `.nvmrc`; `engines.node` restricted to maintained Node 24; **npm 12.2.0** explicitly installed and asserted by CI. Node ships with npm 11.19.0 initially; installing npm 12 is a separate step, not a claim that Node bundles it.
- Update `@types/node` 22 → 24, `zod` 4.1.12 → 4.6.5, `eslint` 10.0.0 → 10.12.0, `@eslint/js` 10.0.0 → 10.0.1, `prettier` 3.9.0 → 3.9.9, TypeScript 6.0.2 → 6.0.3.
- Hold compatible/current tools `@modelcontextprotocol/server` and `@modelcontextprotocol/client` at 2.3.1, `typescript-eslint` at 8.71.1, `vitest` at 5.0.3 and `wrangler` at 4.149.0. **Do not move TypeScript to 7** until the lint ecosystem supports it; the existing `typescript-eslint` peer range ends below TS 6.1.
- Preserve `.npmrc` exact installs, lifecycle-script denial, strict engines and TLS. Never fabricate a lockfile. Regenerate via actual npm CLI and registry to capture transitive dependency integrity hashes.
- GitHub Actions: replace old versions with **verified annotated source refs resolved to full commit SHAs**: checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`. Keep the quality job read-only.
- Do NOT update `wrangler.jsonc`'s Worker compatibility date, add `nodejs_compat`, change public routes or alter the business layer. Workers execute on Cloudflare workerd rather than the development Node runtime.

## Lockfile provenance

The executing agent lacked npm-registry DNS access, so the repo used a strictly temporary, branch-limited GitHub Actions workflow to invoke **real npm 12**:

`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`

On the isolated branch, the job then ran locked install, formatting, lint, typecheck, 15 tests, Wrangler dry-run and high-severity audit **before** pushing only `package-lock.json`. The temporary workflow used a narrow write token for the specific owner branch, did not handle runtime secrets, and was **deleted immediately after success**. No write-enabled bootstrap file may remain in the final PR. Its green run is supporting evidence only; required final verification is the ordinary `strict-ci.yml` pull_request workflow on the exact final HEAD.

## Adversarial acceptance and final gate

1. `npm ci --ignore-scripts --no-audit --no-fund` under Node 24 and pinned npm 12 is reproducible. Record actual `node -v` and `npm -v`; no `--force`, silent peers, script bypass or hand-crafted lock data.
2. `format:check`, `lint`, strict `typecheck`, all existing Vitest protocol/HTTP regressions and `build` succeed. Preserve unknown-tool, invalid JSON, wrong-version, mismatch, concurrent and public fail-closed checks.
3. `npm audit --audit-level=high` passes without waiver. If new findings appear, resolve them properly with audited package updates.
4. The CI workflow's new actions are exact verified full commit SHAs; its permission stays `contents: read`. No OAuth, ClickUp activity, hosted Worker endpoint or production deployment.
5. Final PR remains draft and stacked on PR #3. Confirm green `quality` for its unchanged HEAD_SHA before requesting a *single* read-only specialist `@codex review` with base SHA, head SHA, test evidence and dependency/CI risk scope.
6. Human retains merge authority; do not merge or start Phase 3 as part of this maintenance change.

## Rollback

Revert the toolchain-refresh branch/PR commits to the known-good Phase 2 base. Do not touch Phase 2 PR #3, the default branch, credentials, Worker compatibility date or staff data. If post-upgrade SDK tests regress, stop and isolate the npm/Node, schema and lint transitions one at a time; never disable a gate to obtain green CI.
