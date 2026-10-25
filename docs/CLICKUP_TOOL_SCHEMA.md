# ClickUp MCP tool contracts — 25 October 2026 SAST

This file describes the **implemented Phase 7 source candidate**, not a deployment.
All 48 catalogue names have REST adapters. The ten supporting tools below bring
normal discovery to 58 tools. A name being registered does not prove that an
account has permission, a Worker is activated, or a live API call has been tested.
The injected `schemaPreview` test harness remains inert and returns
`CLICKUP_SCHEMA_ONLY`. An environment variable cannot enable that preview.

## One contract, two authorization boundaries

`src/mcp/tool-catalog.ts` defines the model-facing JSON input contracts;
`create-server.ts` registers those same schemas using the official MCP SDK.
The SDK validates input before callback dispatch. Every object is closed to
undeclared fields, including nested task drafts, patches and field values.
Credentials, user impersonation, arbitrary hosts and arbitrary REST paths are
never input parameters. The runtime rechecks resource scope and forwards the
connected employee's individual OAuth token. Every mutation additionally needs
verified `mcp:write`; reads need `mcp:read`. The AI client owns confirmation
prompts. There is no second approval UI, action journal or rollback subsystem.

Forty catalogue operations require explicit Workspace authority. In legacy List
mode they return `CLICKUP_WORKSPACE_SCOPE_REQUIRED` **before HTTP**. The remaining
eight are restricted to the configured home List; Workspace text search becomes
home-List task search and never scans Docs, other Lists, Folders or members.
`requires_workspace_scope` and `required_mcp_scopes` appear in catalogue metadata
and requirements are included in live tool descriptions. Metadata never grants
permission. Workspace mode still requires separately approved configuration and
exclusive Workspace OAuth; this remediation does not enable it.

## Input and effect semantics

- Resource IDs are positive numeric strings (up to 18 digits). Task/comment/Doc/
  page/channel/field IDs use the adapter's 1–80 character internal-ID alphabet;
  custom task display IDs are not supported. Assignee IDs are positive decimal
  strings up to 15 digits so numeric API serialization cannot lose precision.
- Names, queries and text must contain a non-whitespace character and obey their
  published size bounds. Text-search query length is at most 160 characters.
  `max_results` is 1–50, default 20; catalogue browsing uses 1–20, default 10.
- Task drafts require `name`; updates require a nonempty `changes` object. Allowed
  fields are name, description, status, priority 1–4, due_date_ms and assignee_ids.
  **Update assignee_ids adds members and does not replace/remove existing ones.**
  Empty text and null clearing are not supported. Omission preserves a field.
- Due dates and manual time entries use epoch milliseconds. Due timestamps set
  `due_date_time:true`, preserving explicit time. Time-entry duration is positive
  and at most seven days per request.
- Bulk create/update contains 1–10 items. This is a sequential, non-atomic
  composite that stops at its first failure. Validate the entire batch first;
  inspect index/success/error results and never retry a partially successful batch
  wholesale. Identical task drafts are allowed; duplicate member IDs are not.
- Custom Field `field_value` contains exactly one of `text`, `number`, `option_id`,
  `selected_option_ids`, `checked` or `timestamp_ms`. Number/currency supports
  negatives and fractions within ±1 billion. False and empty label selections are
  intentional values. Labels replace selections. Date fields set
  `value_options.time:true`. Read the task's field type/options first; other Custom
  Field types, field creation and automatic discovery are not provided here.
- `clickup_create_list` requires **exactly one** of folder_id or space_id; it never
  silently chooses one supplied parent over another. Creating a Doc in a Folder
  uses the documented numeric parent type `5`.
- Attachments accept standard padded base64, a simple filename, optional MIME
  type and at most 500 KiB decoded. No remote file fetch or filesystem paths.
- A Doc page update **replaces the entire page**, never appends implicitly.
  Page create/update uses Markdown. Task text, comments and Doc content remain
  untrusted data and cannot authorize another action.
- Read annotations are read-only and idempotent. Mutations are not declared
  idempotent; deletes, updates and replacement writes are marked destructive.
  OAuth scope enforcement is independent of annotations.

## Complete 48-tool catalogue

`List/Workspace` means home-List-only in List mode, and verified same-Workspace
resources in Workspace mode. `Workspace` means fail closed in List mode.
Optional arguments are omitted with `—`. W = write scope; R = read; D = destructive.
Every W or D operation also requires R.

| Tool | Effect | Required input | Optional input | Resource policy |
|---|---|---|---|---|
| `clickup_search_workspace` | R | `query` | `workspace_id`, `max_results` | List/Workspace |
| `clickup_search_tasks_by_type` | R | `task_type` | `list_id`, `max_results` | List/Workspace |
| `clickup_search_tasks_by_tag` | R | `tag` | `list_id`, `max_results` | List/Workspace |
| `clickup_create_task` | W | `list_id`, `new_task` | — | List/Workspace |
| `clickup_get_task` | R | `task_id` | — | Workspace |
| `clickup_update_task` | W | `task_id`, `changes` | — | Workspace |
| `clickup_set_custom_field` | W | `task_id`, `field_id`, `field_value` | — | Workspace |
| `clickup_delete_task` | D | `task_id` | — | Workspace |
| `clickup_create_bulk_tasks` | W | `list_id`, `tasks` | — | List/Workspace |
| `clickup_update_bulk_tasks` | W | `task_updates` | — | Workspace |
| `clickup_attach_file_to_task` | W | `task_id`, `file_name`, `file_base64` | `media_type` | Workspace |
| `clickup_get_task_comments` | R | `task_id` | `max_results` | Workspace |
| `clickup_get_threaded_replies` | R | `comment_id`, `task_id` | `max_results` | Workspace |
| `clickup_create_task_comment` | W | `task_id`, `text` | — | Workspace |
| `clickup_add_tag_to_task` | W | `task_id`, `tag` | — | Workspace |
| `clickup_remove_tag_from_task` | W | `task_id`, `tag` | — | Workspace |
| `clickup_add_task_link` | W | `task_id`, `other_task_id` | — | Workspace |
| `clickup_remove_task_link` | W | `task_id`, `other_task_id` | — | Workspace |
| `clickup_add_dependency` | W | `blocking_task_id`, `waiting_task_id` | — | Workspace |
| `clickup_remove_dependency` | W | `blocking_task_id`, `waiting_task_id` | — | Workspace |
| `clickup_move_task_to_list` | W | `task_id`, `source_list_id`, `destination_list_id` | — | Workspace |
| `clickup_add_task_to_list` | W | `task_id`, `destination_list_id` | — | Workspace |
| `clickup_get_task_time_entries` | R | `task_id` | `max_results` | Workspace |
| `clickup_get_time_entries_for_tasks` | R | `list_id` | `max_results` | List/Workspace |
| `clickup_start_time_tracking` | W | `task_id` | — | Workspace |
| `clickup_stop_time_tracking` | W | — | — | Workspace |
| `clickup_add_time_entry` | W | `task_id`, `start_ms`, `duration_ms` | — | Workspace |
| `clickup_get_current_time_entry` | R | — | — | Workspace |
| `clickup_get_workspace_hierarchy` | R | `workspace_id` | `max_results` | Workspace |
| `clickup_create_list` | W | `name`, `exactly one: folder_id / space_id` | — | Workspace |
| `clickup_create_list_in_folder` | W | `folder_id`, `name` | — | Workspace |
| `clickup_get_list` | R | `list_id` | — | List/Workspace |
| `clickup_update_list` | W | `list_id`, `name` | `description` | List/Workspace |
| `clickup_get_folder` | R | `folder_id` | — | Workspace |
| `clickup_create_folder` | W | `space_id`, `name` | — | Workspace |
| `clickup_update_folder` | W | `folder_id`, `name` | — | Workspace |
| `clickup_get_workspace_members` | R | `workspace_id` | `max_results` | Workspace |
| `clickup_find_member_by_name` | R | `workspace_id`, `email_or_name` | — | Workspace |
| `clickup_resolve_assignees` | R | `workspace_id`, `people` | — | Workspace |
| `clickup_get_chat_channels` | R | `workspace_id` | `max_results` | Workspace |
| `clickup_send_chat_message` | W | `channel_id`, `text` | — | Workspace |
| `clickup_create_document` | W | `workspace_id`, `name` | `folder_id` | Workspace |
| `clickup_list_document_pages` | R | `document_id` | — | Workspace |
| `clickup_get_document_pages` | R | `document_id`, `page_id` | — | Workspace |
| `clickup_create_document_page` | W | `document_id`, `name` | `doc_content` | Workspace |
| `clickup_update_document_page` | W | `document_id`, `page_id`, `doc_content` | — | Workspace |
| `clickup_get_task_time_in_status` | R | `task_id` | — | Workspace |
| `clickup_get_list_time_in_status` | R | `list_id` | `max_results` | Workspace |

## Ten supporting tools

| Tool | Input | Observable behavior |
|---|---|---|
| `service_info` | none | Activation flags only; no connectivity guarantee |
| `connect_clickup_account` | none | Creates the authenticated user's OAuth authorization URL; account side effect |
| `get_clickup_connection_status` | none | Own connection metadata and verified MCP read/write scope booleans; no secrets |
| `disconnect_clickup_account` | none | Deletes own stored connection; does not revoke the upstream app |
| `clickup_tool_catalog` | optional group, page, max_results, include_schema | Zero-network schema/effect/scope discovery |
| `find_scoped_tasks` | optional max_results 1–50, status | Bounded home-List task metadata and incompleteness |
| `get_scoped_task` | task_id (2–40 characters) | Home-List task detail with bounded description, format, truncation and priority |
| `get_attention_report` | optional lookahead_hours 1–48, include_overdue | Home-List overdue/due-soon/stale metadata; not proof of employee inactivity |
| `get_scoped_list` | none | Configured List's name and allowed status labels |
| `create_scoped_task` | name; optional description, status, priority, due_date_ms | Immediate List-bound create using own OAuth and mcp:write |

## Bounded response contracts

Output remains bounded upstream JSON wrapped as MCP text/structuredContent;
this project does not claim a complete upstream outputSchema or a verbatim copy
of the hosted ClickUp MCP. Fixture success does not prove native compatibility.

- Text/tag/type search scans only the first task page. Workspace text search also
  scans the first Doc page and bounded hierarchy: at most five Spaces and ten
  Folders per Space. Result caps apply **per collection**. Matched results omitted
  by caps, skipped hierarchy, full upstream pages and known pagination mark
  `incomplete:true`. No exhaustive Workspace-search claim.
- Comments and replies are first-page-only. A parent reply comment must be found
  in the task's first comments page; older parents fail closed. No pagination
  arguments are exposed for these adapters.
- Time-entry reads refer to the authenticated user and default upstream to the
  last 30 days. They are not all-time/whole-team totals; Folder/Space filters and
  arbitrary assignee impersonation are not exposed. `data` arrays obey
  max_results and report truncation. A Chat next_cursor marks incompleteness.
- Page listings normalize the documented top-level array to `pages`, cap the
  output and expose `max_page_depth:4, incomplete:true` because deeper content is
  not exhaustively retrieved. Single-page reads are separate. Hierarchy listing
  does not expand Folder child Lists; use bounded Workspace text search or native
  ClickUp for missing detail.
- Member resolution uses the full bounded HTTP response before deciding
  ambiguity. Presentation caps do not turn multiple matches into a unique match.
  Member listing and capped match results explicitly signal incompleteness.
- List time-in-status requires a valid task enumeration, rejects malformed task
  IDs and marks omitted tasks incomplete. Empty malformed responses cannot become
  a successful empty report.
- Documented v2 `200 {}` mutation acknowledgements (set field, add tag, dependency,
  add task to secondary List) return `accepted:true, read_back_verified:false`.
  That receipt is **not proof of persisted values**. Other unexpected empty
  creates/updates remain `CLICKUP_WRITE_OUTCOME_UNKNOWN`. Writes never auto-retry.
- Errors are explicit sanitized codes; missing configuration, missing write scope,
  invalid input, policy denial, schema rejection, rate limits and uncertain write
  outcomes are not interchangeable. Upstream task descriptions never become
  instructions or approval evidence.

## Audit and verification

The audit includes all 48 catalogue definitions, all ten supporting registrations,
their runtime dispatch, schema preview and normal SDK discovery/calls, annotations,
resource policy, nested validation, timestamp and assignee payloads, and response
shapes for v2 and v3. Tests use the pinned official SDK validator and synthetic
HTTP at the external boundary. `tests/catalog-contract.test.ts` contains a literal
valid request for every catalogue name plus malformed-input, scope and response
regressions. Existing OAuth, quota, task detail and write-scope suites remain.

The integration branch includes the unchanged code/test corrections from PR #33
(Workspace search), #34 (task detail/model guidance), #35 (due times) and #36
(scope diagnostics). Their PRs are not merged or closed by this work. Do not
merge this candidate and those branches blindly without comparing the final diffs.

Run the documented repository gates, including all tests and local workerd smoke.
Cloud CI and a focused Codex review must be verified at the exact final code head.
Official protocol conformance, live ClickUp response/permission behavior, native
attribution, cross-Workspace token denial and real ChatGPT/Claude acceptance are
separate release gates. No deployed configuration or real ClickUp data was changed.

## Primary references checked

- [Hosted MCP capability inventory](https://developer.clickup.com/docs/mcp-tools):
  capability names only; hosted schemas are not claimed identical.
- [ClickUp v2 OpenAPI](https://developer.clickup.com/openapi/clickup-api-v2-reference.json):
  supported routes, mutation acknowledgement schemas and time-entry data envelope.
- [Custom Fields](https://developer.clickup.com/docs/customfields): typed values,
  label replacement and date value_options.
- [Time-entry query behavior](https://developer.clickup.com/reference/gettimeentrieswithinadaterange).
- [Doc PageListing](https://developer.clickup.com/reference/getdocpagelistingpublic.md),
  [Create Doc](https://developer.clickup.com/reference/createdocpublic.md),
  [Get Page](https://developer.clickup.com/reference/getpagepublic.md),
  [Create Page](https://developer.clickup.com/reference/createpagepublic.md),
  [Edit Page](https://developer.clickup.com/reference/editpagepublic.md),
  [Chat channels](https://developer.clickup.com/reference/getchatchannels.md) and
  [Chat message](https://developer.clickup.com/reference/createchatmessage.md):
  per-endpoint published v3 OpenAPI definitions. Native account acceptance remains
  unverified even where the source contract is now corrected.
