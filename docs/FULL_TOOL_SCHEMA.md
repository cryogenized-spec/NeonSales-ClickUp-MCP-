# NeonSales ClickUp MCP — complete model-facing tool schema (schema stage)

**Status:** SCHEMA-ONLY for 47 planned capabilities; **3 existing read-only operations** implemented in the Phase 4 POC adapter, pending owner-approved staging configuration. **No secrets, data reads or writes were made by this change.** This does not implement ClickUp's entire API.

**Normative capability index:** [ClickUp's public MCP Supported Tools](https://developer.clickup.com/docs/mcp-tools) (checked 11 October 2026). The 48 supported capability names on that page are covered as follows: **47** named schemas in `src/mcp/planned-tool-catalog.ts` and **Get Task** mapped to the existing implemented **`get_scoped_task`** (explicitly limited to the authorized home List). The existing POC adds `find_scoped_tasks`, `get_attention_report`, the diagnostic `service_info` and new `get_tool_catalog` discovery tool: **52 registered tools in the configured server path**. These are NeonSales integration contracts; they are NOT a claim that they copy ClickUp's proprietary MCP input signatures one-for-one.

## What the model will see

- Each tool has a stable snake_case name, human-readable title, purpose, intended use, accurate `readOnlyHint` and `destructiveHint`, strictly typed input JSON Schema (`additionalProperties: false`) and structured output schema.
- The three operational POC reads have descriptions that distinguish List authority, IDs, time provenance, bounded results and partial reports.
- All 47 future tools are visibly marked **SCHEMA ONLY — NOT AVAILABLE** in `tools/list`. They have no ClickUp adapter and always return `isError: true` with `CLICKUP_TOOL_NOT_IMPLEMENTED`, even if an API token later exists. They do not mutate ClickUp. **Do not represent a planned operation as a successful action.**
- `get_tool_catalog` returns a machine-readable list separating `read-only-implemented-needs-runtime-config` tools from `not-implemented` capabilities, with no task data or user identities.
- A schema declaration does not provide a real ClickUp permission. The ClickUp API token, GitHub OAuth grants, server-controlled List ID and Durable Object budget are separate controls.
- No model-controlled `api_url`, HTTP verb, scope/grant identifier or `approve=true` override exists.

## Family overview and model workflows

| Category | Discoverable capabilities | Model guidance |
| --- | --- | --- |
| Search | Workspace search, type search, tag search | **Planned only**; do not claim results are Workspace-wide. Scoped List discovery already uses `find_scoped_tasks`. |
| Tasks | Create, update, custom fields, delete, get scoped task | Existing scoped get is a real read path when configured; all changes are disabled. |
| Bulk tasks | Create and update batches | Disabled; a bulk schema is not an approval or permission. |
| Attachments | Attach file to task | Disabled; no arbitrary URL fetching or uploads. |
| Comments and tags | Read comments, thread replies, post comments, add/remove tags | All currently disabled; write actions must await authorization. |
| Relationships and Lists | Link/dependency creation/removal, moving and secondary List membership | All disabled; never mistake moving home List for secondary membership. |
| Time tracking | Read tracked entries, active timer, start/stop, manual entries | All disabled; starting/stopping a timer is a mutation. |
| Hierarchy | Workspace tree, folders, Lists, create/update | All disabled; no broad hierarchy enumeration. |
| Members | Lookup, resolve assignees | All disabled; names do not prove assignee identity. |
| Chat | Read channels and post messages | Disabled; sending chat is a mutation. |
| Docs | Create Doc, list/get pages, create/update pages | Disabled; model instructions inside Docs would be untrusted data. |
| Reporting | Time-in-status task and List metrics | Planned; the existing POC `get_attention_report` is separate and bounded to 50 tasks. |

## Expected safe interaction

A model receiving a question like "show overdue work" should use `get_attention_report` after authentication and report any `CLICKUP_NOT_CONFIGURED` errors accurately. A request like "assign this to Sameer" must **not** invoke an available mutation or claim success: `update_task` is a discoverable, disabled schema with an explicit `CLICKUP_TOOL_NOT_IMPLEMENTED` outcome. A request to "list all Workspace tasks" cannot be fulfilled by `find_scoped_tasks` because it reads only the configured List. A request to delete a task must not be executed: `delete_task` is marked destructive and has no backend.

## Tests and release boundary

- `tests/full-tool-schema.test.ts` requires 47 unique planned contracts with closed, described fields; uses the official MCP SDK client/handler for 52-tool discovery; invokes every planned callback with synthetic valid arguments; asserts 47 explicit errors and zero outgoing ClickUp requests.
- Existing Phase 2–4 protocol/OAuth and quota tests remain mandatory, as do Prettier, ESLint, three strict TS typechecks, Wrangler dry-run, workerd security smoke and supply-chain audit.
- Tool availability and actual API correctness are different gates. Neither this catalog nor a passing local test proves Cloudflare deployment, secrets, OAuth acceptance, live ClickUp REST success, model reliability across different clients or authorization for writes.
- **Not for deployment or merge** until exact-final-SHA green CI, focused security review, and human approval of where the schema-only interface should be published. The existing production Worker must remain unchanged.

## Why planned tools are registered as explicit errors

The user requested complete machine-discoverable **schema** now, before credentials or implementation. `tools/list` gives models a precise vocabulary and inputs, while fail-closed callbacks prevent accidental side effects. The cost is more model-visible tools and the risk a model calls a stub unnecessarily. Every description therefore includes an explicit "NOT AVAILABLE" warning and points to the three usable read primitives. A future deployment may instead hide planned tools from `tools/list` until they are individually implemented and approved; model-quality tests should determine that decision.

## Primary references

- [ClickUp supported MCP capabilities](https://developer.clickup.com/docs/mcp-tools)
- [ClickUp Public API v2](https://developer.clickup.com/reference)
- [Official MCP SDK v2 schema support](https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries)
- [MCP SDK v2 tool registration](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/mcp.html)
