# Phase 3 OAuth deployment and acceptance checklist

**This is a configuration runbook, NOT a deployment record.** As of 2026-10-10 SAST, no real Cloudflare OAuth App, public endpoint, secret, KV namespace or staff sign-in was verified by this project.

## Identity architecture

Every one of the 2–4 NeonSales staff members uses **their own ChatGPT or Claude subscription** to connect to one NeonSales MCP server. The first POC identity provider is **GitHub OAuth App**: each staff member must also have their *own GitHub account* for sign-in. A ChatGPT or Claude login does not automatically establish identity with our server. The GitHub implementation is modular; a Google/Microsoft identity adapter can replace it later after review.

The Worker uses official `@cloudflare/workers-oauth-provider@1.2.3` for MCP OAuth 2.1, consent, client metadata, resource-bound tokens and revocation. Its public /mcp handler checks each verified `github:<numeric-id>` against the **current** server allowlist and `mcp:read` scope on every call. Removing a staff ID denies future calls even if an existing token has not expired. The backend does not share user sessions or GitHub API tokens.

## Required Cloudflare actions — human operator only

1. Identify the Cloudflare account and a **separate test hostname** that serves the Worker over HTTPS. `wrangler.jsonc` presently specifies `workers_dev: false`; no public Worker will be published automatically. Use an approved custom domain or explicitly configure a Workers.dev test hostname. Record exact `https://<host>` as `MCP_PUBLIC_ORIGIN` (no path, trailing slash, query or fragment).
2. Create a **dedicated KV namespace** for OAuth data (`npx wrangler kv namespace create OAUTH_KV`) and add its actual returned namespace ID as `kv_namespaces: [{ "binding": "OAUTH_KV", "id": "<actual id>" }]` in the intended environment's Wrangler config. Do not guess an ID.
3. In GitHub's OAuth App settings create a **NeonSales POC app** with callback `https://<host>/github/callback`. Create separate applications for local and public test environments. Retain the Client ID and Client Secret in the Cloudflare secret manager, never GitHub source or a chat.
4. Collect the **immutable numeric GitHub user IDs**, not display names, of the 1–4 staff participants. The private Worker binding `ALLOWED_GITHUB_IDS` is a comma-separated list of **1–4 unique safe positive integers**.
5. Configure Cloudflare secrets using `npx wrangler secret put GITHUB_CLIENT_ID`, `npx wrangler secret put GITHUB_CLIENT_SECRET`, `npx wrangler secret put MCP_PUBLIC_ORIGIN`, `npx wrangler secret put ALLOWED_GITHUB_IDS` in the correct environment. Do not put credentials or user IDs into version-controlled config, test files or logs.
6. Retain the `global_fetch_strictly_public` compatibility flag; it protects outbound Client ID Metadata Document fetching. Review Cloudflare's actual DNS routes, secrets and KV binding before the **first manual deployment**.
7. Check that an unauthenticated HTTPS `/mcp` request gets the official **401 challenge** (not a live task response); resource metadata and authorization-server metadata must be discoverable. A misconfigured worker returns 503/404 and is **not deployed-ready**.
8. Verify actual ChatGPT and Claude subscription connection UIs, the browser sign-in, consent and the redirect into each subscribed client **separately**. Confirm each user gets a distinct subject and that another user's saved token cannot be reused to assume their identity.
9. Test after removing one test staff member from the allowlist (their bearer token must stop working). Test expired/revoked tokens, invalid PKCE, wrong audience/issuer, missing scopes, malicious/duplicate callback state, four concurrent logins and a stolen browser state replay.
10. Run the official MCP conformance tool, inspect the authenticated `tools/list` and `service_info`, collect redacted evidence and actual request budgets. Only after passing all security and interface gates may read-only ClickUp be enabled in Phase 4.

## Operational limits

- GitHub is an **upstream user identity service** here; it is not how the ClickUp API is accessed. No ClickUp data is used in Phase 3.
- GitHub login names can change, so allowlist **numeric user IDs**. Only the operator controls the allowlist, and the Worker must revalidate it per invocation.
- Company-level shared ClickUp credentials (if later used) imply a **single ClickUp REST budget** shared by staff. Coordinated rate-limiting belongs to Phase 4.
- Do not enable `mcp:write` or any task-modification tool in Phase 3. Later writes need independent human approval and audit.
- GitHub Free/private cannot enforce branch checks. PR merges and Cloudflare deploys remain manual, explicitly approved actions.
- Cloudflare OAuth Provider currently supports MCP 2026-07-28 and supports Client ID Metadata Documents; protocol implementation and account compatibility are still distinct acceptance criteria.

References: https://github.com/cloudflare/workers-oauth-provider ; https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md ; https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md
