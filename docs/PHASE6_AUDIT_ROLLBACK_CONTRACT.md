# Action attribution, audit and controlled rollback — proposed Phase 6 contract

**Owner direction (2026-10-11 SAST):** Prefer ClickUp-native user attribution with **a separate ClickUp OAuth grant for every staff member**. Build a minimal external journal only for provenance ClickUp cannot know (MCP authenticated principal, AI client/agent, human approval and rollback links). **No task-mutating endpoint exists on this branch; this is an acceptance contract, not a rollback implementation.**

## System of record

- **ClickUp:** official activity stream / signed task webhooks identify an actual ClickUp user and often include `history_items.date`, `before`, `after` and resource identifiers. Do not assume every event or before/after pair is available. Verify webhook `X-Signature` HMAC before use and deduplicate on `webhook_id:history_item_id`. Native activity timestamps must be displayed in SAST (UTC+02:00), with raw UTC retained.
- **NeonSales action journal:** minimal append-only, uniquely keyed records for actor GitHub subject, independently verified ClickUp user ID, client identity, tool name, proposal reference, approver identity, task ID/home List, request creation/approval/execution/outcome timestamp (UTC), before and after metadata with explicit known/unknown flags, and upstream ClickUp event IDs as they arrive. No OAuth tokens, customer descriptions, email addresses, raw prompts or PII in logs. The AI model cannot choose or impersonate these attribution fields.
- **User-facing visibility:** `get_agent_action_history` can later retrieve bounded, authorized records for the current user and approved Lists; written ClickUp comments may be useful when explicitly requested but should not be spammed automatically. The journal records failed/denied attempts with safe redacted metadata as well as completed changes.

## Safe reversal

An action is reversible only if the exact old value is recorded and its undo operation is supported by current ClickUp APIs. Create a *proposal* rather than applying rollback automatically. Resolve the currently authorized user and owner-approved List, re-fetch the current task with that user's ClickUp OAuth token, ensure the field still equals the prior agent-written value, ensure the task and home List are unchanged, and require new human approval bound to the object version, actor, desired reversal and expiry.

After approval, atomically consume the one-time approval record, re-fetch and compare again immediately before the API write, then execute a narrow compensating update under the current **approver/actor's own** ClickUp token. Record the attempt and result, including conflict, uncertainty (timeouts), and the new upstream change ID when observed. ClickUp does **not** provide a general conditional-update API guarantee; pre-checks cannot eliminate an external race between GET and PATCH. For sensitive operations, require human review if concurrent edits are possible and never claim an atomic rollback that ClickUp does not provide.

Deletion, notifications, external messages and third-party side effects may be nonreversible even if task metadata can be restored. Never erase original audit entries when undoing. Any interrupted or ambiguous mutation must be reconciled against ClickUp before retrial (no blind replay).

## Rollout gates

1. Finish individual OAuth and verify ClickUp task activity attributes a controlled operation to the correct consenting ClickUp user.
2. Implement append-only journal and verified webhook event correlation using synthetic fixtures, then test duplicate/out-of-order events and signature failures.
3. Implement proposal + explicit one-time human approval + rollback preflight, with adversarial concurrency and stale-state tests.
4. Only then expose narrowly scoped write and `prepare_rollback` / `commit_approved_rollback` tools. No AI-generated text alone counts as approval.
5. Record evidence and deployment SHA; keep rollback disabled until independent reviewer and real staging tests pass.

Primary references: https://developer.clickup.com/docs/webhooks and https://developer.clickup.com/docs/webhooktaskpayloads and https://developer.clickup.com/docs/webhooksignature.
