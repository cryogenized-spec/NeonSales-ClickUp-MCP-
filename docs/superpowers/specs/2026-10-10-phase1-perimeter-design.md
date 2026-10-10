# Phase 1 — Engineering perimeter design

**Date:** 2026-10-10 SAST. **Source:** owner's instruction to build in phases, reuse worthwhile Elara Relay engineering disciplines, reserve Codex for post-CI specialist review, maintain modular boundaries, no shortcuts.
**Scope:** governance/docs plus deterministic executable repository integrity checks. **Out of scope:** npm package graph, SDK application code, OAuth, live ClickUp access, real MCP conformance.

## Goal and observable success

Any new implementation agent receives one bounded task, verifiable project state and consistent architecture boundaries. GitHub Actions rejects missing perimeter docs and checks the policy runner's tests. The project openly recognizes that private Free-plan GitHub branch protection cannot technically be enforced.

## Three approaches evaluated

1. **Copy Elara Relay governance wholesale.** Very thorough, but its 29K-word review skill, Postgres/UI/migration gates and many scripts would introduce unnecessary coupling. REJECT.
2. **Prose-only AGENTS.md.** Low cost, no true fail-closed checks. REJECT.
3. **Existing upstream skills + small project-specific authority documents and testable CI rules.** Retain one responsibility per component, exact SHA evidence and procedural Free-plan merge discipline. SELECTED.

## Module topology (forward design; no code this phase)

`runtime` (Cloudflare fetch) → `mcp` (official v2 SDK) → `application` (use cases) → `ports` (typed interfaces) ← `clickup` / `auth` / `approval-store` adapters. Tool descriptions never enforce authorization. Client-vendor differences must terminate at protocol/OAuth boundary.

## Engineering controls

- Existing upstream Superpowers skill versions remain pinned; use them rather than writing new proprietary skills.
- Add `docs/phases/ROADMAP.md`, `docs/CODEX_REVIEW.md`, `docs/SECURITY_PERIMETER.md`, this spec and the Phase 1 plan. These become mandatory policy inputs.
- Extend Python repo guard (dependency-free) to require phase metadata and prohibit premature `PHASE_2_COMPLETE` or other fake certification markers.
- Test the guard in two directions: missing docs fail; docs present pass. Keep six prior tests.
- Append approved decisions and update canonical checkpoint with exact CI SHA.
- Keep Phase 1 PR stacked on the earlier standards PR, unmerged until owner reviews.
- Codex ping only for code-bearing phase PRs after green; create template/rules now but no specialist spend on this docs-only change.

## GitHub Free limitation and fallback

No GitHub ruleset can be assumed active on this private Free repository. Human owner controls merges, forbids direct commits to main by team process, and performs exact-SHA review. CI success is evidence but does not technically prevent bypass. Deployment remains disabled pending separately controlled credentials and human signoff.

## Verification

A passing GitHub Actions `quality` status on the exact Phase 1 head commit proves the added documentation and guard regression tests. It **does not** prove TypeScript build, MCP conformance, Cloudflare authentication or live ClickUp functionality. Failure of any documentation/guard test blocks progression to Phase 2.
