# PR #25 security review and release gate — 21 October 2026 (SAST)

**Review scope:** Existing branch `fix/phase7-postmerge-codex-hardening-20261015`, reviewed head `17eb8df63552781a8559f9a210cbfb8a03e7352f` before this documentation commit. This records a security assessment **not** an approval, waiver, completed remediation, or live acceptance.

**Owner constraints:** Retain all 48 registered ClickUp REST operations. Preserve each employee's individual ClickUp OAuth identity, Cloudflare Workers hosting, and ClickUp-native history. No new action journal, rollback database, duplicate approval UI, production mutation, or deployment is authorized by this review.

## Verified in source, synthetically tested

1. **Workspace task search / List grant (P1 source finding):** `clickup_search_workspace` now requests `GET /list/{granted_list_id}/task`, verifies each returned task's home List, and does not issue `GET /team/{workspace_id}/task`. `tests/phase7-catalog.test.ts` has a foreign-home-task denial test. This is a source/mock-test finding, **not live ClickUp acceptance**.
2. **Bulk input prevalidation:** `clickup_create_bulk_tasks` and `clickup_update_bulk_tasks` validate their submitted batch before performing any POST/PUT; negative tests protect malformed later drafts.
3. **Inventory:** `OPERATIONAL_CATALOG_NAMES` continues to contain 48 operations, and a test asserts exact count/uniqueness. Count alone cannot prove real endpoint compatibility or useful authorization.

## Still open — security design conflict / P1

The runtime checks task home List with `GET /task/{id}` (and validates List hierarchy), then later calls task-ID-based APIs such as `PUT /task/{id}` or other reads/mutations. An external ClickUp actor can move the task from permitted List A to disallowed List B **between** those calls. The second API call has no documented atomic List/revision precondition, so an OAuth principal with permission to B may still alter or read the task after its home List no longer matches the MCP grant.

- A second preflight check, post-write check, MCP-local lock, Cloudflare Durable Object mutex, or caching cannot prevent concurrent changes by actors operating directly in ClickUp. They must not be represented as a fix.
- ClickUp's own access enforcement may block the post-move action **if** the connected principal truly loses rights to the destination. This requires live account/permission evidence; it is not true for arbitrary full-access Workspace members.
- The current ClickUp update-task documentation specifies `PUT /api/v2/task/{task_id}`, with no `If-Match`, task revision or home-List conditional parameter in its published contract: https://developer.clickup.com/reference/updatetask .
- ClickUp permissions depend on hierarchy, account role, task ownership and sharing, including default access to public items: https://help.clickup.com/hc/en-us/articles/6309221065495-Permissions-in-detail .
- **Disposition:** unresolved; PR #25 remains **NO MERGE / NO DEPLOY as security-cleared**, pending separate release decision.

## Still open — operational semantics / P2

`clickup_move_task_to_list` and `clickup_add_task_to_list` stay registered, but the configured **single-List grant** rejects any useful cross-List destination. This retains their names without functioning cross-List semantics. Resolving that requires an expressly authorised destination-List policy, or an owner-approved change of resource boundary. Do not silently expand grants. Other explicitly Workspace-scoped Docs/Chat/hierarchy tools need separate acknowledgement of their broader scope than task reads.

## Concrete acceptance matrix (NOT YET RUN)

Use two *disposable* ClickUp Lists in one testing Workspace, A (granted) and B (not granted), two independently authenticated employees and test tasks only. No customer records. Record current permission settings and actual REST responses, actor attribution and request/result timestamps without storing access tokens.

1. **Search isolation:** an in-scope task appears in A; a task homed in B never appears in task-search responses; additional-List tasks must not leak through A.
2. **Bulk validation:** a malformed second draft causes **zero** attempted writes, and valid batches report explicit partial outcomes on simulated upstream failure.
3. **Concurrent move, read:** after a task is moved A→B between preflight and task-ID lookup, assert no out-of-grant task body/history is returned through MCP.
4. **Concurrent move, write:** move the disposable task A→B after preflight and before an update; assert ClickUp's **upstream** API denies mutation for each relevant scoped employee OAuth identity. If any principal can update B, the single-List boundary is **not protected**, irrespective of mock tests. This demands externally coordinated live testing; mocking a 403 is insufficient.
5. **Cross-List tools:** verify expected behavior against an explicitly approved destination-List grant, once one is designed/accepted; do not claim these operational while only the home List is permitted.
6. **Workspace-scoped tools:** explicitly review whether Docs, Chat and hierarchy exposure is compatible with the intended authorisation; verify per-user ClickUp permissions separately.
7. **CI/review:** obtain Strict CI green on the **exact revised head SHA** and a fresh focused Codex security review. A green CI run does not substitute for live permission semantics.

## Release decision paths — no option accepted yet

**Path A (preferred if feasible):** Preserve 48 operations while proving upstream ClickUp permissions prevent out-of-scope edits after external task moves, for **every** connected employee role and supported task placement. Consider private destinations, restricted/limited members and carefully checked task-sharing inheritance; do **not** assume restricted permissions where users can edit public Lists. Record negative live evidence and review remaining read-time races.

**Path B:** A documented ClickUp conditional/List-bound mutation API could supply atomic enforcement, if one becomes available and is implemented with tests.

**Path C:** Change the product's resource boundary from single-List to broader Workspace grants (including documented cross-List operations) **only after explicit owner approval and threat-model revision**. That is a policy change, not a silent fix.

Absent a verified mitigation or separately accepted revised security boundary, preserve the owner-required 48-tool code surface but **maintain deployment hold**.

**Next action:** Independently verify actual ClickUp OAuth principal permissions and staged race behavior before deciding which release path is defensible. Do not merge, deploy, enable live writes, or request secrets through chat.
