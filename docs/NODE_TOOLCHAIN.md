# Node 24 toolchain bootstrap and outstanding supply-chain gate

**2026-10-10 SAST; draft PR #5, not approved for merging.**

## Runtime distinction

Cloudflare Workers run on `workerd`; Node 24 is the pinned local/CI build runtime, not the deployed Worker execution environment.

`.nvmrc` selects Node **24.21.0**, which ships npm **11.19.0**. This branch currently declares `packageManager: npm@12.2.0` and `engines.npm: >=12.2.0 <13`. The committed `.npmrc` has `engine-strict=true`. Consequently **`nvm use; npm ci` fails** on a fresh clone until npm is explicitly bootstrapped. The `packageManager` field alone does NOT replace the running npm executable.

For **reproduction only**, with Node 24 selected and on a trusted development machine:

```bash
nvm install
nvm use
npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund
node --version # v24.21.0
npm --version  # 12.2.0
npm ci --ignore-scripts --no-audit --no-fund
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
node --test .github/scripts/check-npm-cli-bundles.test.cjs
npm audit --audit-level=high
node .github/scripts/check-npm-cli-bundles.cjs
```

**STOP when the last check fails.** These steps illustrate the current branch state; they do **not** authorize production use or a merge. The proposed pin `npm@12.2.0` is **not security-cleared**. A patched npm release must be independently confirmed and the pin/engines/CI bootstrap and lockfile updated and retested together, including an exact-commit green CI and specialist review. Do not hide the failure with `|| true`, `continue-on-error`, `npm audit fix --force`, unsafe overrides or undocumented waivers.

## Why project-only audit was insufficient

The original `npm audit --audit-level=high` inspects the application's `package-lock.json`, **not the globally installed npm CLI's embedded dependencies**. Codex found a P2 blind spot on PR #5. GitHub npm CLI issue [#10062](https://github.com/npm/cli/issues/10062), checked 2026-10-10, documents npm 12.2.0 bundling:
- `brace-expansion@5.0.9` (patched baseline `5.0.12` per npm maintainers' report)
- `ip-address@10.5.0` (patched baseline `10.7.1`)
- `undici@6.28.0` (patched baseline `6.28.1`)

The newer npm **11.21.0** release's own published bundled lockfile also lists those same versions, so changing back to npm 11.21.0 would not solve the vulnerability. A bundled package cannot be repaired by the application's `overrides`. An isolated CLI tree/version checker lives in `.github/scripts/check-npm-cli-bundles.cjs`, with adversarial fixture tests alongside it. It checks nested installs too and **fails closed** when any observed relevant package version is below the documented patched threshold or absent. Those hard-coded thresholds must be re-reviewed against new advisories before a future green run is treated as security certification.

This scanner is a **focused known-issue gate**, not a complete audit of every dependency inside npm. Even after passing it, independent full toolchain supply-chain review remains required.

## Merge/order discipline

1. Preserve corrected Phase 2 draft PR #3 and its review; no cross-agent branch overwrites.
2. PR #5 stays **DRAFT/BLOCKED** until an npm CLI version with patched bundles is selected and all project/toolchain CI gates pass. The branch is still useful as a reproducible Node 24 / updated-action candidate.
3. The separate Phase 3 OAuth PR #4 currently has merge conflicts on its Phase 2 base and overlaps `package.json`, `package-lock.json` and `docs/PROJECT_STATE.md`. Its owner must reconcile it **after** PR #5 is approved; regenerate the combined lockfile with a real npm CLI, retain all OAuth dependencies, and rerun the full auth/protocol/adversarial test suite on the final SHA.
4. Human reviews and merges the stacked foundation PR #1 → #2 → #3, followed by approved PR #5, then integrated PR #4. Never force-push the other agent's branch or deploy as part of maintenance.
