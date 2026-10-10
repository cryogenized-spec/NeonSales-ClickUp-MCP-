# Phase 3 — authenticated MCP / individual staff identities

**Status:** Implementation design, 2026-10-10 SAST. **Scope:** no ClickUp operations; target up to four staff members, each with their own ChatGPT/Claude subscription, plus a distinct upstream identity-provider login. We implement GitHub OAuth **for a first POC**, behind an adapter; staff without GitHub logins require a separate identity-provider integration, not a bypass.

## Architecture choice

Keep a **single Cloudflare Worker** for Phase 3 and isolate its responsibilities in modules; a separate OAuth resource/auth Worker pair is preferred for a later multi-resource fleet, but doubles POC configuration. Use pinned `@cloudflare/workers-oauth-provider@1.2.3` to implement MCP 2026-07-28 OAuth 2.1, protected-resource metadata, authorization-server discovery, PKCE token issuance/revocation, per-client consent and token audience binding. **Do not write a homebrew token validator or sign bearer tokens yourself.** Use official SDK v2 for MCP message handling after resource authorization.

```text
ChatGPT/Claude subscription (OAuth client) -- HTTPS --> Worker OAuthProvider
   /authorize -> consent page, browser-bound state -> GitHub OAuth App
   /github/callback -> GitHub token exchange and authenticated /user ID
                        -> exact server-side allowlist -> OAuth grant
   /mcp -> validate resource-bound token -> check per-call mcp:read scope
           -> check verified user ID still on staff allowlist
           -> official MCP SDK v2 handler, read-only service_info
```

## Module contracts

- `src/auth/env.ts`: secret and deployment binding shape; validate canonical HTTPS resource URL and required secrets at runtime; refuse missing configuration.
- `src/auth/staff.ts`: parse exactly 1–4 unique numeric GitHub user IDs from `ALLOWED_GITHUB_IDS`, reject duplicates/malformed/zero; immutable `Principal` with `github:<id>` subject, no role inference from client input. Recheck allowlist every authenticated request.
- `src/auth/consent.ts`: HTML-escape user-controlled OAuth client data, show client name/verified domain/redirect host/loopback warning/scopes; use Cloudflare `beginConsent/approveConsent/denyConsent` helpers and their browser-bound cookie/CSP. No automatic consent.
- `src/auth/github.ts`: OAuth code exchange with confidential client secret and PKCE S256 verifier, followed by `GET https://api.github.com/user`, never trusting claimed names or `X-User`. Timeout, non-2xx, malformed data and unauthorized ID all fail closed. No GitHub access token persisted after identity check.
- `src/auth/authorize.ts`: validate request via provider helper, begin consent, redirect upstream only after consent; browser-bound state, callback recovery, error redirect. No client ID/redirect URI from the callback request.
- `src/auth/worker.ts`: `new OAuthProvider` from official 1.2.3 package; protected `/mcp` only, no public debug route; `McpApiHandler` derives immutable identity exclusively from verified provider `ctx.props`, validates `ctx.auth.scope`, and delegates to SDK.
- `src/index.ts`: Worker entrypoint with safe configuration gate; no test auth bypass; secrets are Wrangler Worker bindings only.
- `tests/staff.test.ts`, `tests/github.test.ts`, `tests/consent.test.ts`, `tests/auth-boundary.test.ts`: tests before production code; four simultaneous users, forged tokens/headers, duplicate IDs, removed staff identity, wrong scopes, wrong resource/audience, GitHub errors, HTML injection and replay; official provider integration tests where feasible.

## Deployed configuration (not supplied to chat or git)

`MCP_PUBLIC_ORIGIN=https://<actual-public-worker-host>` (exact canonical origin), `ALLOWED_GITHUB_IDS=<1 to 4 stable numeric GitHub user IDs>` (Worker config secret), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (secrets), and `OAUTH_KV` (dedicated KV namespace). GitHub OAuth App callback URI is `<origin>/github/callback`. Use `global_fetch_strictly_public` if enabling client-ID metadata URLs; origin must match inbound request URL; disable automatic deployment until human reviews account setup.

**Important:** GitHub login is an independent identity verification step. A person's ChatGPT/Claude subscription credentials are never copied to the Worker. Staff must be allowlisted by stable numeric ID, not mutable login names.

## Acceptance gates / nonclaims

- CLI `npm ci`, pinned TS strict, ESLint, Prettier, automated unit/adversarial tests, Wrangler dry-run, npm audit all pass on exact PR SHA.
- Official Cloudflare OAuth library handles token, resource and state checks; tests ensure our boundary refuses wrong user/scope, public URLs, request spoofing, unexpected duplicates and removed staff.
- Require a separate integration gate before production: real Cloudflare KV/OAuth deployment, GitHub app setup, **four real staff authentications**, each chatbot's real subscription UI; full official MCP conformance. These cannot pass in this chat without the accounts/settings and are explicitly **NOT TESTED**.
- GitHub Free private PR CI status is advisory; no silent merges. Codex only after current SHA green and only once stable.

## References

- https://github.com/cloudflare/workers-oauth-provider
- https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md
- https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
