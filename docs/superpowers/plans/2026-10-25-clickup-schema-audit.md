# ClickUp schema/adapter audit — 25 October 2026 SAST

Owner request: inspect the complete ClickUp tool schema and fix confirmed defects.
Phase: existing Phase 7 catalogue contract remediation, not new capabilities.

## Scope and acceptance

Inspect all 48 catalogue definitions and the ten supporting MCP tools. Preserve
their names, individual OAuth, write-scope challenges, quota and no-retry rules.
Use the current PR #33 head as the baseline and integrate the existing code/tests
from PRs #34–36 without merging any PR into main. No ClickUp records, credentials,
Cloudflare settings, deployment or broader resource authorization are changed.

1. Reproduce schema holes through the official SDK validator: invalid identifiers,
   empty batches/updates, ambiguous Custom Field variants and List parents.
2. Tighten only the existing input contracts; preserve negative/decimal numeric
   Custom Fields, false checkboxes and explicit due times. Describe additive
   assignees, replacement Doc writes, partial search/time results and policy gates.
3. Reproduce List-grant leakage through Workspace metadata operations. Deny
   Workspace-only calls before HTTP and restrict List-mode text search to tasks.
4. Match documented empty JSON mutation acknowledgements and time-entry `data`
   arrays; distinguish accepted writes from verified read-back. Keep unknown
   create/update outcomes non-retriable and explicit.
5. Add regressions first, then minimal fixes. Verify all 48 schemas and every
   category, SDK discovery/calls, positive and negative scope behavior, formatting,
   lint, strict types, all tests, build, policy checks, workerd smoke and audit.
6. Replace stale schema documentation with a complete 48-tool contract register,
   record findings and evidence, publish a draft PR, await exact-head cloud CI,
   and request the repository's focused Codex review only after green.

Primary API references: https://developer.clickup.com/docs/mcp-tools,
https://developer.clickup.com/docs/customfields,
https://developer.clickup.com/openapi/clickup-api-v2-reference.json,
https://developer.clickup.com/reference/gettimeentrieswithinadaterange.
Synthetic checks do not establish live ClickUp compatibility or client acceptance.
