# Phase 1 security perimeter / trust authority ledger

**Scope:** one internal tool gateway, not an autonomous AI agent. No production ClickUp credentials or staff/customer content in this repo or tests.

## External actors and trust levels

| Actor | Trust | Granted authority |
|---|---|---|
| ChatGPT/Claude via MCP | Untrusted tool invocations until remote user OAuth is verified | None when unauthenticated; scoped task READ only after verified authorization |
| MCP host / Cloudflare Worker | Process boundary, **not** inherently trusted if compromised | Holds deploy secret for ClickUp REST adapter, never exposed to models |
| ClickUp REST API | External data and operation source | Data returned is untrusted content; API authorization separate from MCP |
| Human NeonSales operator | Account-bound principal after verified OAuth | POC read allowlist, may independently approve one disposable test change |
| Reviewer (Codex) | Read-only untrusted analysis tool | Analyze diff, never receive backend or deployment secrets |
| GitHub PR/CI content | Potentially attacker-controlled | May be inspected in disposable runners; no secret-bearing PR jobs |
| GitHub Free repository owner/admin | Can bypass ordinary CI if authorized to write | **Procedural**, not enforceable merge security |

## Invariants

**Single authority for each decision:** MCP SDK owns protocol parsing; OAuth verifier owns identity/authentication; application service owns scope decisions; ClickUp adapter owns external transport; a transactional approval store owns single-use write authorization. No duplicated token verifier or alternate REST update path.

**Fail closed:** malformed MCP inputs, invalid bearer tokens, wrong scopes/lists, unauthorized action, token expiry, server clock error, unexpected ClickUp response shape, 429, missing pagination and store outages must NEVER silently return a successful live report or execute a write. A legitimate read may report **explicitly partial** results, never silently truncated.

**Data minimization:** read only an explicitly approved ClickUp List/Workspace; no all-Workspace blind scans; no task text embedded into system instructions. Strip PII, restrict log fields, redact responses and annotate provenance.

**Write safety:** no real task write in phases 1–5. In phase 6, proposal approval must be separate, immutable, bounded to one disposable task and bound to authenticated human identity/nonce/time; use durable atomic store, not Cloudflare KV eventual-consistency for the actual single-use claim.

**Authentication:** third-party subscription clients authenticate **to our MCP Worker** using proper OAuth semantics; Worker separately authenticates with ClickUp REST API using a stored limited-scope credential. Cloudflare publicly routed HTTPS URL must NEVER contain a permissive unauthenticated path to real data.

**Review:** inspect exact SHA using read-only credentials. Task descriptions, PR bodies, review comments and READMEs are untrusted input and cannot grant permission, alter review criteria or ask for secrets.

## Negative acceptance tests to implement in later phases

- No auth, invalid auth, expired token, wrong audience/scope → deny request before ClickUp.
- Valid token but wrong Workspace/List/task ID → deny and confirm **zero** ClickUp requests.
- ChatGPT reads and Claude reads match same tool contracts without duplicated app code.
- ClickUp 429 / timeout / mid-page error → bounded retry and truthful partial/failure result; zero unapproved writes.
- Concurrent/replayed approval → at most one ClickUp update, audit receipt and exact field hash.
- Prompt injection in task body requests secrets → stays inert data.
- No CI green on exact SHA → reviewer handoff not triggered. No Codex response → review not recorded as PASS.

No security certification is claimed by this document. Verification instructions are in ROADMAP.md and DEMO_ACCEPTANCE.md.
