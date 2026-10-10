# Phase 4 implementation plan — AFTER spec and owner approval

**Status: BLOCKED / PROPOSED.** Planning artifact only; no Phase 4 runtime code or ClickUp data access is authorized. Depends on completed owner-reviewed Phase 3, a confirmed Workspace/List authorization scope and a decision about Cloudflare Durable Objects.

**Spec:** [Phase 4 read-only ClickUp design](../specs/2026-10-10-phase4-readonly-design.md).

## Preconditions and ownership

- PR #4 remains Phase 3's canonical code branch; do not modify it from this design branch.
- First finish the current exact-SHA Codex follow-up on OAuth and address any new P1/P2 findings. Do not mistake a green synthetic build for working hosted OAuth.
- Owner reviews/approves the allowed List/Workspace, the explicit staff-to-List grants, scope of returned fields, and Durable Object quota coordinator.
- No ClickUp token in GitHub, chat, CI, unit fixtures or stdout. Credentials later go into isolated staging secrets. The GitHub Free private repo's CI gate is human-enforced.

## Test-first implementation units

1. **Policy-bound test harness:** Introduce typed `AuthorizedReadContext` from official SDK `authInfo`, validate immutable staff subject and READ entitlement. Start with 8+ red tests showing missing/wrong/grant-removed principals produce **zero** outgoing HTTP requests; no alternative `X-User`/argument principal fallback. Implement only policy until tests green.
2. **Strict injectable ClickUp GET transport:** Add a thin client with a fixed `api.clickup.com/api/v2` origin, allowlisted GET path templates, 5-second per-request timeout and schema decoder. Create synthetic fixtures for valid/invalid list and task responses, 401/403/404/429, corrupt body and timeouts. On network errors, fail closed. No POST/PATCH/PUT/DELETE client methods.
3. **Durable Object quota reservation:** Define interface `reserve({credentialKey, verifiedSubject, nowMs})` and a deterministic pure policy engine first. Test four-user interleavings, two simulated Worker isolates, crash/restart, clock regressions and zero-state startup; reservations are atomic, durably persisted and never exceed the conservative shared 80-in-60s ceiling. Then implement SQLite-backed Durable Object with fake storage tests. Outbound HTTP occurs *after* reserving; 429 feedback adjusts cooldown.
4. **Normalized read tools:** Add minimal `find_scoped_tasks` and `get_scoped_task` official SDK registrations with closed JSON schemas. Test real SDK callback propagation, cross-List refusal, task-ID/path injection, pagination page 0–2, multi-List home matching, duplicates, output cap and explicit incompleteness. Use synthetic data only. Verify truthful MCP read-only annotations.
5. **48-hour attention report:** Write clock-injected tests for overdue, due soon and not-updated-in-48h cohorts, timezone formatting in SAST, empty/missing timestamps, 48-hour exact boundary, partial pagination and a stale task with no due date. Add only deterministic normalizer/report code after tests go red.
6. **Full regression and staging gate:** Require existing 56+ Phase 3 tests, new policy/transport/quota/report tests, npm ci, Prettier, ESLint, all three strict TS profiles, Wrangler dry-run, repository-policy checks and project/supply-chain audit. Require exact final SHA green before one read-only Codex review. **Real staging** then requires separate owner authorization and secrets before one scoped read; 401/403/429, revocation and concurrent four-user behavior must be observed, not inferred from mocks.

## Traceable acceptance IDs

| ID | Owner must see before merge |
|---|---|
| P4-AUTH-01 | Every ClickUp call has one verified, currently allowlisted OAuth principal and explicit List READ grant |
| P4-READ-02 | No exported non-GET API; paths cannot be extended or redirected by model content |
| P4-LIMIT-03 | All Workers/staff share one durable per-token request budget with fair and bounded reservations |
| P4-FAIL-04 | Missing bindings/storage/headers or 401/403/429/timeouts fail closed; no silent partial result |
| P4-PAGE-05 | Fixed page/result ceilings, provenance and explicit partial metadata |
| P4-TIME-06 | 48h report semantics and SAST conversion tested at boundaries |
| P4-CI-07 | Final exact-SHA CI + Codex review, no stale approval or merge/deploy bypass |
| P4-LIVE-08 | Separate owner-scoped real list read, staff authentication and both clients evaluated before launch |

## Explicit exclusions

Do not add real ClickUp writes, task approvals, unrestricted Workspace search, recurring monitoring, Gmail/Notion linkage, public worker deployment or vendor-specific duplicated MCP services. Phase 5 handles real subscription client acceptance and Phase 6 handles independently approved writes.

## Rollback strategy

Every unit lands as a separate reviewable commit on the Phase 4 branch, not on the OAuth agent's branch. If a dependency is unavailable or the resource quota cannot be coordinated, stay read-disabled and revert only the Phase 4 additions. The already-proven OAuth/SDK foundation and external credentials remain untouched.
