# POC acceptance checklist — Sunday 11 October 2026 target

**Target demonstration:** ~13:00 SAST Sunday 2026-10-11, aspirational only, not a guarantee. **This is an evidence checklist, not a claim of readiness.**

| ID | Criterion | Current status on 2026-10-10 | Evidence required |
|---|---|---|---|
| A1 | Run prior local POC package tests | PASS — 12/12 re-run during docs session | `npm test` output in prior local starter |
| A2 | MCP init, tools/list, synthetic tools/call | PRIOR SESSION REPORTED PASS; not re-run here | Fresh local inspector/smoke transcript |
| A3 | Synthetic data explicitly labeled and zero real ClickUp calls | PASS in local tests only | Mock-source assertions |
| A4 | Read actual authorized NeonSales ClickUp data | NOT TESTED | Result IDs/links checked independently in ClickUp |
| A5 | 48-hour and overdue report matches selected ClickUp List | NOT TESTED | Deterministic comparison and partial-results checks |
| A6 | Unauthorized reads/writes blocked | SIMULATED only | Hosted OAuth/allowlist negative tests |
| A7 | Deployed remote HTTPS Streamable HTTP MCP + OAuth | NOT DONE | Real HTTPS endpoint plus auth flow and denial test |
| A8 | ChatGPT ordinary subscription personal plugin executes live tool | NOT DONE | Recorded user-initiated live round trip |
| A9 | Claude ordinary subscription remote connector executes live tool | NOT DONE | Recorded user-initiated live round trip |
| A10 | Independently approved disposable test task update | NOT TESTED live | Owner approval, task audit, replay denial |
| A11 | No secret leakage and safe logs | DESIGN RULES only | Repo scan, runtime config review and negative tests |
| A12 | Costs, request budgets, limitations evidenced | NOT DONE | Actual counts, pricing sources, exception cases |

**GO / NO-GO:** Do not call the project a working *cross-client* POC until A4, A5, A7, A8 and A9 pass. Do not claim write capability until A10 passes. Do not pitch business outcomes until those claims have reproducible evidence.

**Disclaimers:** 100 REST API requests/minute/token on ClickUp Free Forever is a rate limit, not free unlimited operations. `date_updated` reflects ClickUp task metadata; no claim of employee inactivity is implied. Subscription features depend on account/workspace availability and must be verified.
