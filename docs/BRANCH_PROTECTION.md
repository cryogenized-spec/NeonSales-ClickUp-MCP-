# GitHub CI enforcement runbook — private repository

## Critical caveat

A YAML workflow **runs tests**; it does NOT, by itself, prevent merges or direct pushes. **GitHub branch protection/rulesets must require passing checks** and prevent bypassing. GitHub's official docs say rulesets on **private repositories require GitHub Pro, Team or Enterprise Cloud**; a private repo on GitHub Free cannot be assumed to have enforced branch rules. Verify the actual account plan before claiming 'unskippable' gates.

Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

## Proposed branch ruleset for `main` (requires eligible plan)

GitHub → repository **Settings → Rules → Rulesets → New branch ruleset**. Target default branch `main`, enforcement **Active**.

1. Require pull request before merging, at least one **independent** approval where there is another collaborator; dismiss stale approvals and require conversation resolution. Never pretend the repository owner can independently review their own changes.
2. Require status check **`quality`** from **GitHub Actions**, and strict branch-up-to-date status. Once separate protocol and security jobs exist, add each required check by exact stable name. Establish a first successful run before selecting it as a required check.
3. Block force pushes, restrict deletions, require linear history. Disable admin bypass / do not grant bypass roles wherever plan permits.
4. Use `.github/CODEOWNERS` as an ownership hint. Enforce required CODEOWNERS review only if a genuinely different reviewer is available. Do not create a permanent deadlock for a solo repo without discussing it.
5. Restrict who can deploy and set production environment reviewers separately; CI success alone must **not** deploy automatically to a live ClickUp-connected server.
6. Test the gate: create a throwaway failing PR and verify it **cannot merge**. Retain screenshot or settings evidence before advertising enforcement.

**User confirmed GitHub Free on 2026-10-10.** As long as this private repo stays on Free, treat branch protection as unavailable; this runbook is the procedure to apply after an eligible upgrade. CI green is advisory evidence and **cannot** stop a user with write permission from pushing/merging. Human owner must explicitly check the latest SHA and CI before merging. Never claim this is an unbypassable gate.

**Owner action required:** No GitHub Settings enforcement has been applied by this document or by committing a workflow. Connection currently exposes GitHub file/PR operations, not ruleset administration. Mark enforcement status **NOT VERIFIED** until the above is configured and probed.

## Workflow `strict-ci.yml`

- Job **`quality`**, triggered on PRs, pushes to main and manually; read-only `GITHUB_TOKEN` permissions.
- Runs Python 3 standard-library repository policy validator, including byte-for-byte upstream skill pin checks and required docs, then **six Python regression tests** that prove tampering and incomplete TS scaffolds are rejected.
- **Fail-closed application activation:** before TypeScript app exists, policy reports documentation-only and does not claim lint/typechecks are complete. The first addition of `src/**/*.ts`, a `package.json` or lockfile mandates **both** package.json + lockfile, tsconfig, ESLint config and real npm scripts.
- Once activated, run `npm ci` from the lockfile; `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=high`. No `continue-on-error`, `|| true`, or hidden test skipping.
- Production MCP conformance must be a **separate required CI/release gate** once a server exists and test OAuth can be exercised; see `MCP_COMPLIANCE.md`. Do not label docs-only checks 'MCP compliant'.

## Limitations and next hardening tasks

- Commit-hash pin GitHub Actions; automated Dependabot PRs for review, never silent major upgrades.
- When source arrives: add dependency graph/import rules, TypeScript strict settings, typed schema checks, coverage minima, security SAST and conformance suite with pinned versions.
- Security critical files `AGENTS.md`, `.github/workflows/**`, `.github/CODEOWNERS`, `scripts/check_repo_policy.py`, vendored skills and release configuration need human review on PR; CODEOWNERS expresses intent but enforcement requires branch settings.
- GitHub Actions on a direct push can report a failure **after the code landed**; only active rules can prevent that push. No model-generated document can remove an admin's ultimate ability to alter repository settings.
