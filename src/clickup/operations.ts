import { getScopedTask, quotaCall } from "./client.js";
import { ReadFailure, type ReadGrant } from "./policy.js";

/**
 * Minimal native ClickUp REST adapter. ClickUp remains the ONLY task/activity
 * system of record; no journal, duplicate approvals, or compensating rollbacks.
 * Only authenticated per-user OAuth tokens enter here, from requireWriteGrant.
 */
const ROOT = "https://api.clickup.com/api/v2/";
const MAX_JSON_BYTES = 1_000_000;
const idPattern = /^[A-Za-z0-9_-]{2,40}$/;
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function taskId(id: string): string {
  if (!idPattern.test(id)) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return encodeURIComponent(id);
}
async function requestJson(
  grant: ReadGrant,
  fetcher: typeof fetch,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await quotaCall(grant, "reserve");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(new URL(path, ROOT), {
      method,
      headers: {
        Authorization: grant.apiToken,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new ReadFailure("CLICKUP_UPSTREAM_DENIED");
    if (response.status === 429) throw new ReadFailure("CLICKUP_RATE_LIMITED");
    if (!response.ok) throw new ReadFailure("CLICKUP_UPSTREAM_UNAVAILABLE");
    const type = response.headers.get("content-type") ?? "";
    const size = response.headers.get("content-length");
    if (
      !type.toLowerCase().includes("application/json") ||
      (size !== null && Number(size) > MAX_JSON_BYTES)
    )
      throw new ReadFailure("CLICKUP_BAD_RESPONSE");
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) throw new ReadFailure("CLICKUP_BAD_RESPONSE");
    const parsed: unknown = JSON.parse(text);
    const decoded = obj(parsed);
    if (!decoded) throw new ReadFailure("CLICKUP_BAD_RESPONSE");
    return decoded;
  } catch (error) {
    if (error instanceof ReadFailure) throw error;
    // A timeout after POST/PUT may mean the operation actually succeeded.
    throw new ReadFailure(
      method === "GET" ? "CLICKUP_UPSTREAM_UNAVAILABLE" : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
    );
  } finally {
    clearTimeout(timeout);
  }
}
const optionalText = (value: unknown, limit: number): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > limit)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return value;
};
const optionalPriority = (v: unknown): number | undefined => {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 4)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return v as number;
};
const optionalDate = (v: unknown): number | undefined => {
  if (v === undefined) return undefined;
  if (!Number.isSafeInteger(v) || (v as number) <= 0 || (v as number) > 9_000_000_000_000)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return v as number;
};
export interface TaskInput {
  name?: string;
  description?: string;
  status?: string;
  priority?: number;
  due_date_ms?: number;
}
function bodyFromInput(raw: unknown, create: boolean): Record<string, unknown> {
  const value = obj(raw);
  if (
    !value ||
    Object.keys(value).some(
      (key) => !["name", "description", "status", "priority", "due_date_ms"].includes(key),
    )
  )
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  const name = optionalText(value["name"], 180);
  const description = optionalText(value["description"], 8000);
  const status = optionalText(value["status"], 80);
  const priority = optionalPriority(value["priority"]);
  const due = optionalDate(value["due_date_ms"]);
  if ((create && !name) || (!create && Object.keys(value).length === 0))
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(due !== undefined ? { due_date: due } : {}),
    ...(create ? { check_required_custom_fields: true, notify_all: false } : {}),
  };
}
function responseId(payload: Record<string, unknown>, expected?: string): string {
  const id = payload["id"];
  if (typeof id !== "string" || !idPattern.test(id) || (expected && id !== expected))
    throw new ReadFailure("CLICKUP_WRITE_OUTCOME_UNKNOWN");
  return id;
}
export async function createScopedTask(
  grant: ReadGrant,
  data: TaskInput,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const body = bodyFromInput(data, true);
  const upstream = await requestJson(
    grant,
    fetcher,
    "POST",
    "list/" + grant.listId + "/task",
    body,
  );
  const id = responseId(upstream);
  if (upstream["list"] !== undefined && String(obj(upstream["list"])?.["id"]) !== grant.listId)
    throw new ReadFailure("CLICKUP_WRITE_OUTCOME_UNKNOWN");
  return {
    action: "task_created",
    task_id: id,
    list_id: grant.listId,
    source: "clickup-api-v2",
    accepted: true,
  };
}
export async function updateScopedTask(
  grant: ReadGrant,
  id: string,
  changes: TaskInput,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const clean = taskId(id);
  const body = bodyFromInput(changes, false);
  await getScopedTask(grant, id, fetcher); // verified home List before any write
  const upstream = await requestJson(grant, fetcher, "PUT", "task/" + clean, body);
  responseId(upstream, id);
  return {
    action: "task_updated",
    task_id: id,
    list_id: grant.listId,
    source: "clickup-api-v2",
    accepted: true,
  };
}
export async function addScopedTaskComment(
  grant: ReadGrant,
  id: string,
  comment: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const clean = taskId(id);
  const text = optionalText(comment, 6000);
  if (!text) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  await getScopedTask(grant, id, fetcher);
  const upstream = await requestJson(grant, fetcher, "POST", "task/" + clean + "/comment", {
    comment_text: text,
    notify_all: false,
  });
  const commentId = upstream["id"];
  if (typeof commentId !== "string" && typeof commentId !== "number")
    throw new ReadFailure("CLICKUP_WRITE_OUTCOME_UNKNOWN");
  return {
    action: "comment_created",
    task_id: id,
    comment_id: String(commentId),
    source: "clickup-api-v2",
    accepted: true,
  };
}
export async function getScopedTaskComments(
  grant: ReadGrant,
  id: string,
  limit: number,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const clean = taskId(id);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  await getScopedTask(grant, id, fetcher);
  const upstream = await requestJson(grant, fetcher, "GET", "task/" + clean + "/comment");
  if (!Array.isArray(upstream["comments"])) throw new ReadFailure("CLICKUP_BAD_RESPONSE");
  const comments: Record<string, unknown>[] = [];
  for (const value of upstream["comments"].slice(0, limit)) {
    const comment = obj(value);
    if (!comment) throw new ReadFailure("CLICKUP_BAD_RESPONSE");
    const rawId = comment["id"];
    const date = comment["date"];
    const rawText = comment["comment_text"];
    const fallback = comment["comment"];
    const content =
      typeof rawText === "string"
        ? rawText
        : Array.isArray(fallback)
          ? fallback
              .map((part: unknown) => obj(part)?.["text"] ?? "")
              .filter((part: unknown) => typeof part === "string")
              .join("")
          : "";
    comments.push({
      id: typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : null,
      text: content.slice(0, 6000),
      date_ms:
        (typeof date === "string" || typeof date === "number") && /^\d{1,15}$/.test(String(date))
          ? Number(date)
          : null,
      author_id: obj(comment["user"])?.["id"] ?? null,
    });
  }
  return {
    source: "clickup-api-v2",
    task_id: id,
    comments,
    incomplete: upstream["comments"].length >= 25 || upstream["comments"].length > limit,
    note: "First ClickUp comment page only; ClickUp owns task history.",
  };
}
export async function getScopedList(
  grant: ReadGrant,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const list = await requestJson(grant, fetcher, "GET", "list/" + grant.listId);
  if (String(list["id"]) !== grant.listId)
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  if (typeof list["name"] !== "string") throw new ReadFailure("CLICKUP_BAD_RESPONSE");
  const statuses = Array.isArray(list["statuses"])
    ? list["statuses"]
        .slice(0, 60)
        .map((v: unknown) => obj(v)?.["status"])
        .filter((v: unknown) => typeof v === "string")
    : [];
  return {
    source: "clickup-api-v2",
    list_id: grant.listId,
    name: list["name"].slice(0, 180),
    statuses,
  };
}
