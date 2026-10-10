# Phase 1 engineering perimeter — Implementation Plan

> **For agentic workers:** This plan implements only the reviewed owner-directed perimeter scope. Test-first changes; no SDK/ClickUp code. Use Superpowers execution/review methods as applicable.

**Goal:** Preserve modular, secure development boundaries with exact phase handoff and post-green Codex review discipline, audited by GitHub Actions.

**Architecture:** The existing Python standard-library repository guard validates mandatory project state and vendored skills; a small regression test extends those guarantees. Docs describe the intended modular runtime architecture but do not instantiate it.

**Tech Stack:** GitHub Actions, Python 3 standard library, Markdown and upstream Superpowers skills.

**Spec:** `docs/superpowers/specs/2026-10-10-phase1-perimeter-design.md`

## Global constraints

- No ClickUp token, model API key, OAuth/hosting integration or production write.
- On GitHub Free, status checks are advisory unless separate enforceable policy exists.
- All success claims must match the exact PR HEAD SHA and real CI run.
- Do not request Codex on Phase 1 docs-only; code-bearing phases require post-green targeted review.

## Review focus

1. Stacked PR can be misread as standalone on main — disclose base branch.
2. Upstream skills copied from another project become mutable — keep existing SHA pin checks.
3. Human approval confused with technical branch protection — declare limitation.
4. Codex consumes resources unnecessarily — demand stable green CI and exact SHA before requesting.
5. A docs-only green CI gets misrepresented as an MCP/TypeScript pass — explicitly distinguish.

## Task 1 — Phase documents and architecture

**Files created:** `docs/phases/ROADMAP.md`, `docs/CODEX_REVIEW.md`, `docs/SECURITY_PERIMETER.md`, this spec.

**Verification:** Each identifies owner-governed scope, future testing, two-client requirements and present nonclaims. Run standard repository checks in CI.

## Task 2 — Deterministic policy integrity

**Files:** `scripts/check_repo_policy.py`; `scripts/tests/test_repository_policy.py`.

- [ ] Add a **failing regression test** proving the newly introduced mandatory Phase 1 docs are not all present in the `REQUIRED` list.
- [ ] Open PR and observe expected **RED** CI. Record run ID, do not claim completion.
- [ ] Extend `REQUIRED` with exact Phase 1 files and spec/plan.
- [ ] Rerun full `quality` and regression tests to **GREEN**.
- [ ] Check that no new script can skip policy checks.

## Task 3 — Agent/Codex and roadmap continuity

**Files:** `AGENTS.md`, `CLAUDE.md`, `docs/WORKFLOW.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`.

- [ ] Add concise links to Phase 1 review, security and specialist review documents.
- [ ] Ensure exact HEAD_SHA + post-green requirement is documented and no false "Codex reviewed" claims appear.
- [ ] Update canonical checkpoint with actual PR/run results only.
- [ ] Wait for verified green and human review. Do not merge PR without explicit instruction.

## Completion criteria

Phase 1 is ready for review only if the GitHub Actions `quality` job for the final commit is SUCCESS, including the entire Python guard and its regression suite. There is **no** TS compiler/MCP/auth pass in this phase.
