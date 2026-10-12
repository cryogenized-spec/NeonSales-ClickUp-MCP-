import { quotaCall } from "./client.js";
import { ReadFailure, type ReadGrant } from "./policy.js";

/** REST-backed ClickUp tool catalogue. No extra approval controls, state journal,
 * rollback engine or background watcher. ClickUp itself owns all task history.
 * The calling human's own OAuth identity is the ONLY upstream actor. */
type Json = Record<string, unknown>;
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
const obj = (x: unknown): Json | null =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Json) : null;
const id = (v: unknown): string => {
  if ((typeof v !== "number" && typeof v !== "string") || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(v)))
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return encodeURIComponent(String(v));
};
const val = (a: Json, k: string) => id(a[k]);
const txt = (v: unknown, max = 8000): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return v;
};
const count = (a: Json) => {
  const n = a["max_results"] ?? 20;
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 50)
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return n as number;
};
const clip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.slice(0, 50).map(clip);
  if (obj(v))
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !/token|secret|authorization|password/i.test(k))
        .map(([k, x]) => [k, clip(x)]),
    );
  if (typeof v === "string") return v.slice(0, 12000);
  return v;
};
function buildArgs(a: Json, key: string): Json {
  const b = obj(a[key]);
  if (!b) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return b;
}
function pathEncoded(p: string) {
  if (!/^api\/v[23]\//.test(p) || p.includes("..") || p.includes("//") || /[\\#]/.test(p))
    throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
  return "https://api.clickup.com/" + p;
}
async function send(
  grant: ReadGrant,
  fetcher: typeof fetch,
  method: Method,
  path: string,
  body?: Json,
): Promise<Json> {
  const target = pathEncoded(path);
  await quotaCall(grant, "reserve");
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 7000);
  try {
    const res = await fetcher(target, {
      method,
      redirect: "manual",
      signal: abort.signal,
      headers: {
        Authorization: grant.apiToken,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status === 429) {
      const reset = res.headers.get("X-RateLimit-Reset");
      if (reset && /^\d{1,12}$/.test(reset)) {
        const unix = Number(reset);
        if (unix > Date.now() / 1000 && unix < Date.now() / 1000 + 3600)
          await quotaCall(grant, "cooldown", unix * 1000);
      }
      throw new ReadFailure("CLICKUP_RATE_LIMITED");
    }
    if (res.status === 401 || res.status === 403) throw new ReadFailure("CLICKUP_UPSTREAM_DENIED");
    if (!res.ok)
      throw new ReadFailure(
        method === "GET" || res.status < 500
          ? "CLICKUP_UPSTREAM_UNAVAILABLE"
          : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
      );
    if (res.status === 204 || res.status === 205) return { success: true };
    const t = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? "0");
    if (!t.includes("application/json") || length > 1000000)
      throw new ReadFailure(
        method === "GET" ? "CLICKUP_BAD_RESPONSE" : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
      );
    const text = await res.text();
    if (text.length > 1000000)
      throw new ReadFailure(
        method === "GET" ? "CLICKUP_BAD_RESPONSE" : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
      );
    const result: unknown = JSON.parse(text);
    const data = obj(result);
    if (!data)
      throw new ReadFailure(
        method === "GET" ? "CLICKUP_BAD_RESPONSE" : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
      );
    return data;
  } catch (e) {
    if (e instanceof ReadFailure) throw e;
    throw new ReadFailure(
      method === "GET" ? "CLICKUP_UPSTREAM_UNAVAILABLE" : "CLICKUP_WRITE_OUTCOME_UNKNOWN",
    );
  } finally {
    clearTimeout(timeout);
  }
}
const v2 = (p: string) => "api/v2/" + p;
const v3 = (p: string) => "api/v3/" + p;
async function spaces(grant: ReadGrant, f: typeof fetch): Promise<Json[]> {
  const data = await send(
    grant,
    f,
    "GET",
    v2("team/" + id(grant.workspaceId) + "/space?archived=false"),
  );
  if (!Array.isArray(data["spaces"]) || data["spaces"].length > 500)
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  return data["spaces"].filter((x: unknown) => obj(x) !== null) as Json[];
}
async function inWorkspace(grant: ReadGrant, f: typeof fetch, spaceId: unknown): Promise<void> {
  const allowed = await spaces(grant, f);
  if (!allowed.some((s) => String(s["id"]) === String(spaceId)))
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
}
async function listInWorkspace(grant: ReadGrant, f: typeof fetch, listId: unknown): Promise<Json> {
  const list = await send(grant, f, "GET", v2("list/" + id(listId)));
  if (String(list["id"]) !== String(listId))
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  await inWorkspace(grant, f, obj(list["space"])?.["id"]);
  return list;
}
async function taskInWorkspace(grant: ReadGrant, f: typeof fetch, taskId: unknown): Promise<Json> {
  const task = await send(grant, f, "GET", v2("task/" + id(taskId)));
  if (String(task["id"]) !== String(taskId))
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  await listInWorkspace(grant, f, obj(task["list"])?.["id"]);
  return task;
}
async function folderInWorkspace(
  grant: ReadGrant,
  f: typeof fetch,
  folderId: unknown,
): Promise<Json> {
  const folder = await send(grant, f, "GET", v2("folder/" + id(folderId)));
  if (String(folder["id"]) !== String(folderId))
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  await inWorkspace(grant, f, obj(folder["space"])?.["id"]);
  return folder;
}
const taskBody = (a: Json) => ({
  ...(typeof a["name"] === "string" ? { name: txt(a["name"], 180) } : {}),
  ...(typeof a["description"] === "string" ? { description: txt(a["description"]) } : {}),
  ...(typeof a["status"] === "string" ? { status: txt(a["status"], 80) } : {}),
  ...(a["priority"] !== undefined ? { priority: a["priority"] } : {}),
  ...(a["due_date_ms"] !== undefined ? { due_date: a["due_date_ms"] } : {}),
  ...(Array.isArray(a["assignee_ids"]) ? { assignees: a["assignee_ids"].map(id) } : {}),
});
async function members(grant: ReadGrant, f: typeof fetch): Promise<Json[]> {
  const d = await send(grant, f, "GET", v2("team"));
  const team = Array.isArray(d["teams"])
    ? d["teams"].map(obj).find((t) => String(t?.["id"]) === grant.workspaceId)
    : null;
  if (!team || !Array.isArray(team["members"])) throw new ReadFailure("CLICKUP_BAD_RESPONSE");
  return team["members"]
    .slice(0, 200)
    .map((x: unknown) => obj(x) ?? {})
    .map((x) => obj(x["user"]) ?? x);
}
const short = (d: Json, limit = 50): Json =>
  clip({
    ...d,
    ...(Array.isArray(d["tasks"]) ? { tasks: d["tasks"].slice(0, limit) } : {}),
  }) as Json;

/** Every entry is a real REST adapter, not an inert schema or fabricated result.
 * File uploads require binary file access unavailable to MCP text-only schemas;
 * that single capability stays off the operational registry. */
export const OPERATIONAL_CATALOG_NAMES: readonly string[] = [
  "clickup_search_workspace",
  "clickup_search_tasks_by_type",
  "clickup_search_tasks_by_tag",
  "clickup_create_task",
  "clickup_get_task",
  "clickup_update_task",
  "clickup_set_custom_field",
  "clickup_delete_task",
  "clickup_create_bulk_tasks",
  "clickup_update_bulk_tasks",
  "clickup_get_task_comments",
  "clickup_get_threaded_replies",
  "clickup_create_task_comment",
  "clickup_add_tag_to_task",
  "clickup_remove_tag_from_task",
  "clickup_add_task_link",
  "clickup_remove_task_link",
  "clickup_add_dependency",
  "clickup_remove_dependency",
  "clickup_move_task_to_list",
  "clickup_add_task_to_list",
  "clickup_get_task_time_entries",
  "clickup_get_time_entries_for_tasks",
  "clickup_start_time_tracking",
  "clickup_stop_time_tracking",
  "clickup_add_time_entry",
  "clickup_get_current_time_entry",
  "clickup_get_workspace_hierarchy",
  "clickup_create_list",
  "clickup_create_list_in_folder",
  "clickup_get_list",
  "clickup_update_list",
  "clickup_get_folder",
  "clickup_create_folder",
  "clickup_update_folder",
  "clickup_get_workspace_members",
  "clickup_find_member_by_name",
  "clickup_resolve_assignees",
  "clickup_get_chat_channels",
  "clickup_send_chat_message",
  "clickup_create_document",
  "clickup_list_document_pages",
  "clickup_get_document_pages",
  "clickup_create_document_page",
  "clickup_update_document_page",
  "clickup_get_task_time_in_status",
  "clickup_get_list_time_in_status",
];
export async function runCatalogOperation(
  name: string,
  a: Json,
  g: ReadGrant,
  f: typeof fetch,
): Promise<Json> {
  const W = id(g.workspaceId),
    N = count(a);
  const call = (method: Method, path: string, body?: Json) => send(g, f, method, path, body);
  const task = async (k: string) => taskInWorkspace(g, f, a[k]);
  const list = async (k: string) => listInWorkspace(g, f, a[k]);
  const folder = async (k: string) => folderInWorkspace(g, f, a[k]);
  // Only input-declared Workspace IDs can be supplied; they must match OAuth-bound Workspace.
  if (a["workspace_id"] !== undefined && String(a["workspace_id"]) !== g.workspaceId)
    throw new ReadFailure("CLICKUP_SCOPE_OR_SCHEMA_REJECTED");
  switch (name) {
    case "clickup_search_workspace": {
      const q = txt(a["query"], 160).toLowerCase();
      const results = await call("GET", v2("team/" + W + "/task?page=0&subtasks=true"));
      const tasks = Array.isArray(results["tasks"]) ? results["tasks"] : [];
      const docs = await call("GET", v3("workspaces/" + W + "/docs?limit=50"));
      const d = Array.isArray(docs["docs"]) ? docs["docs"] : [];
      return {
        source: "clickup-api",
        tasks: clip(tasks.filter((x) => JSON.stringify(x).toLowerCase().includes(q)).slice(0, N)),
        docs: clip(d.filter((x) => JSON.stringify(x).toLowerCase().includes(q)).slice(0, N)),
        incomplete: tasks.length >= 100,
      };
    }
    case "clickup_search_tasks_by_type":
    case "clickup_search_tasks_by_tag": {
      const target = a["list_id"] ?? g.listId;
      await listInWorkspace(g, f, target);
      const result = await call(
        "GET",
        v2("list/" + id(target) + "/task?page=0&subtasks=true&include_closed=true"),
      );
      const tasks = Array.isArray(result["tasks"]) ? result["tasks"] : [];
      const found = tasks.filter((x) => {
        const t = obj(x);
        if (!t) return false;
        return name.endsWith("by_type")
          ? String(t["custom_item_id"]) === String(a["task_type"])
          : Array.isArray(t["tags"]) &&
              t["tags"].some(
                (tag: unknown) =>
                  String(obj(tag)?.["name"]).toLowerCase() === String(a["tag"]).toLowerCase(),
              );
      });
      return {
        source: "clickup-api-v2",
        tasks: clip(found.slice(0, N)),
        incomplete: tasks.length >= 100 || found.length > N,
      };
    }
    case "clickup_create_task": {
      await list("list_id");
      const payload = taskBody(buildArgs(a, "new_task"));
      if (!payload.name) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
      return short(
        await call("POST", v2("list/" + val(a, "list_id") + "/task"), {
          ...payload,
          notify_all: false,
        }),
      );
    }
    case "clickup_get_task":
      return short(await task("task_id"));
    case "clickup_update_task":
      await task("task_id");
      return short(
        await call("PUT", v2("task/" + val(a, "task_id")), taskBody(buildArgs(a, "changes"))),
      );
    case "clickup_set_custom_field": {
      await task("task_id");
      const field = buildArgs(a, "field_value");
      const value =
        field["text"] ??
        field["number"] ??
        field["option_id"] ??
        field["selected_option_ids"] ??
        field["checked"] ??
        field["timestamp_ms"];
      if (value === undefined) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
      return short(
        await call("POST", v2("task/" + val(a, "task_id") + "/field/" + val(a, "field_id")), {
          value,
        }),
      );
    }
    case "clickup_delete_task":
      await task("task_id");
      return call("DELETE", v2("task/" + val(a, "task_id")));
    case "clickup_create_bulk_tasks": {
      await list("list_id");
      const tasks = a["tasks"];
      if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 10)
        throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
      const outcome: unknown[] = [];
      for (let i = 0; i < tasks.length; i++) {
        const payload = taskBody(obj(tasks[i]) ?? {});
        if (!payload.name) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
        try {
          outcome.push({
            index: i,
            success: true,
            response: clip(await call("POST", v2("list/" + val(a, "list_id") + "/task"), payload)),
          });
        } catch (e) {
          outcome.push({
            index: i,
            success: false,
            error: e instanceof ReadFailure ? e.code : "CLICKUP_UNAVAILABLE",
          });
          break;
        }
      }
      return {
        source: "clickup-api-v2",
        results: outcome,
        partial: outcome.some((x) => obj(x)?.["success"] === false),
      };
    }
    case "clickup_update_bulk_tasks": {
      const updates = a["task_updates"];
      if (!Array.isArray(updates) || updates.length < 1 || updates.length > 10)
        throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
      const outcome: unknown[] = [];
      for (let i = 0; i < updates.length; i++) {
        const x = obj(updates[i]);
        if (!x) throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
        try {
          await taskInWorkspace(g, f, x["task_id"]);
          outcome.push({
            index: i,
            success: true,
            response: clip(
              await call("PUT", v2("task/" + id(x["task_id"])), taskBody(obj(x["changes"]) ?? {})),
            ),
          });
        } catch (e) {
          outcome.push({
            index: i,
            success: false,
            error: e instanceof ReadFailure ? e.code : "CLICKUP_UNAVAILABLE",
          });
          break;
        }
      }
      return {
        source: "clickup-api-v2",
        results: outcome,
        partial: outcome.some((x) => obj(x)?.["success"] === false),
      };
    }
    case "clickup_get_task_comments":
      await task("task_id");
      return short(await call("GET", v2("task/" + val(a, "task_id") + "/comment")), N);
    case "clickup_get_threaded_replies":
      return short(await call("GET", v2("comment/" + val(a, "comment_id") + "/reply")), N);
    case "clickup_create_task_comment":
      await task("task_id");
      return call("POST", v2("task/" + val(a, "task_id") + "/comment"), {
        comment_text: txt(a["text"], 6000),
        notify_all: false,
      });
    case "clickup_add_tag_to_task":
      await task("task_id");
      return call("POST", v2("task/" + val(a, "task_id") + "/tag/" + val(a, "tag")));
    case "clickup_remove_tag_from_task":
      await task("task_id");
      return call("DELETE", v2("task/" + val(a, "task_id") + "/tag/" + val(a, "tag")));
    case "clickup_add_task_link":
    case "clickup_remove_task_link":
      await task("task_id");
      await task("other_task_id");
      return call(
        name.includes("remove") ? "DELETE" : "POST",
        v2("task/" + val(a, "task_id") + "/link/" + val(a, "other_task_id")),
      );
    case "clickup_add_dependency":
    case "clickup_remove_dependency": {
      await task("blocking_task_id");
      await task("waiting_task_id");
      return call(
        name.includes("remove") ? "DELETE" : "POST",
        v2("task/" + val(a, "waiting_task_id") + "/dependency"),
        { depends_on: a["blocking_task_id"] },
      );
    }
    case "clickup_move_task_to_list": {
      await task("task_id");
      await list("source_list_id");
      await list("destination_list_id");
      return call(
        "PUT",
        v3(
          "workspaces/" +
            W +
            "/tasks/" +
            val(a, "task_id") +
            "/home_list/" +
            val(a, "destination_list_id"),
        ),
        { move_custom_fields: false },
      );
    }
    case "clickup_add_task_to_list":
      await task("task_id");
      await list("destination_list_id");
      return call(
        "POST",
        v2("list/" + val(a, "destination_list_id") + "/task/" + val(a, "task_id")),
      );
    case "clickup_get_task_time_entries":
      await task("task_id");
      return short(
        await call("GET", v2("team/" + W + "/time_entries?task_id=" + val(a, "task_id"))),
        N,
      );
    case "clickup_get_time_entries_for_tasks":
      await list("list_id");
      return short(
        await call("GET", v2("team/" + W + "/time_entries?list_id=" + val(a, "list_id"))),
        N,
      );
    case "clickup_start_time_tracking":
      await task("task_id");
      return call("POST", v2("team/" + W + "/time_entries/start"), { tid: a["task_id"] });
    case "clickup_stop_time_tracking":
      return call("POST", v2("team/" + W + "/time_entries/stop"));
    case "clickup_add_time_entry":
      await task("task_id");
      return call("POST", v2("team/" + W + "/time_entries"), {
        tid: a["task_id"],
        start: a["start_ms"],
        duration: a["duration_ms"],
      });
    case "clickup_get_current_time_entry":
      return call("GET", v2("team/" + W + "/time_entries/current"));
    case "clickup_get_workspace_hierarchy": {
      const sp = await spaces(g, f);
      const results: unknown[] = [];
      for (const space of sp.slice(0, Math.min(N, 10))) {
        const sid = id(space["id"]);
        const fs = await call("GET", v2("space/" + sid + "/folder?archived=false"));
        const ls = await call("GET", v2("space/" + sid + "/list?archived=false"));
        results.push({
          space: clip(space),
          folders: clip(fs["folders"]),
          lists: clip(ls["lists"]),
        });
      }
      return {
        source: "clickup-api-v2",
        workspace_id: g.workspaceId,
        spaces: results,
        incomplete: sp.length > Math.min(N, 10),
      };
    }
    case "clickup_create_list": {
      if (a["folder_id"] !== undefined) {
        await folder("folder_id");
        return call("POST", v2("folder/" + val(a, "folder_id") + "/list"), {
          name: txt(a["name"], 180),
        });
      }
      await inWorkspace(g, f, a["space_id"]);
      return call("POST", v2("space/" + val(a, "space_id") + "/list"), {
        name: txt(a["name"], 180),
      });
    }
    case "clickup_create_list_in_folder":
      await folder("folder_id");
      return call("POST", v2("folder/" + val(a, "folder_id") + "/list"), {
        name: txt(a["name"], 180),
      });
    case "clickup_get_list":
      return short(await list("list_id"));
    case "clickup_update_list":
      await list("list_id");
      return call("PUT", v2("list/" + val(a, "list_id")), {
        name: txt(a["name"], 180),
        ...(a["description"] ? { content: txt(a["description"]) } : {}),
      });
    case "clickup_get_folder":
      return short(await folder("folder_id"));
    case "clickup_create_folder":
      await inWorkspace(g, f, a["space_id"]);
      return call("POST", v2("space/" + val(a, "space_id") + "/folder"), {
        name: txt(a["name"], 180),
      });
    case "clickup_update_folder":
      await folder("folder_id");
      return call("PUT", v2("folder/" + val(a, "folder_id")), { name: txt(a["name"], 180) });
    case "clickup_get_workspace_members":
      return {
        source: "clickup-api-v2",
        workspace_id: g.workspaceId,
        members: clip((await members(g, f)).slice(0, N)),
      };
    case "clickup_find_member_by_name": {
      const q = txt(a["email_or_name"], 160).toLowerCase();
      const found = (await members(g, f)).filter(
        (x) =>
          String(x["username"] ?? x["email"] ?? "")
            .toLowerCase()
            .includes(q) ||
          String(x["email"] ?? "")
            .toLowerCase()
            .includes(q),
      );
      return {
        source: "clickup-api-v2",
        matches: clip(found.slice(0, 50)),
        ambiguous: found.length !== 1,
      };
    }
    case "clickup_resolve_assignees": {
      const people = a["people"];
      if (!Array.isArray(people) || people.length > 12)
        throw new ReadFailure("CLICKUP_INVALID_ARGUMENT");
      const users = await members(g, f);
      return {
        source: "clickup-api-v2",
        results: people.map((x) => {
          const q = txt(x, 160).toLowerCase();
          const hits = users.filter(
            (u) =>
              String(u["email"] ?? "").toLowerCase() === q ||
              String(u["username"] ?? "").toLowerCase() === q,
          );
          return { query: x, matches: clip(hits), ambiguous: hits.length !== 1 };
        }),
      };
    }
    case "clickup_get_chat_channels":
      return short(
        await call("GET", v3("workspaces/" + W + "/chat/channels?limit=" + Math.min(N, 50))),
        N,
      );
    case "clickup_send_chat_message":
      return call(
        "POST",
        v3("workspaces/" + W + "/chat/channels/" + val(a, "channel_id") + "/messages"),
        { type: "message", content: txt(a["text"], 6000) },
      );
    case "clickup_create_document": {
      const body: Json = { name: txt(a["name"], 180), create_page: true };
      if (a["folder_id"] !== undefined) {
        await folder("folder_id");
        body["parent"] = { id: String(a["folder_id"]), type: "FOLDER" };
      }
      return call("POST", v3("workspaces/" + W + "/docs"), body);
    }
    case "clickup_list_document_pages":
      return short(
        await call(
          "GET",
          v3(
            "workspaces/" + W + "/docs/" + val(a, "document_id") + "/page_listing?max_page_depth=4",
          ),
        ),
      );
    case "clickup_get_document_pages":
      return short(
        await call(
          "GET",
          v3(
            "workspaces/" +
              W +
              "/docs/" +
              val(a, "document_id") +
              "/pages/" +
              val(a, "page_id") +
              "?content_format=text%2Fmd",
          ),
        ),
      );
    case "clickup_create_document_page":
      return call("POST", v3("workspaces/" + W + "/docs/" + val(a, "document_id") + "/pages"), {
        name: txt(a["name"], 180),
        content: typeof a["doc_content"] === "string" ? a["doc_content"] : "",
        content_format: "text/md",
      });
    case "clickup_update_document_page":
      return call(
        "PUT",
        v3("workspaces/" + W + "/docs/" + val(a, "document_id") + "/pages/" + val(a, "page_id")),
        {
          content: txt(a["doc_content"], 12000),
          content_edit_mode: "replace",
          content_format: "text/md",
        },
      );
    case "clickup_get_task_time_in_status":
      await task("task_id");
      return short(await call("GET", v2("task/" + val(a, "task_id") + "/time_in_status")));
    case "clickup_get_list_time_in_status": {
      await list("list_id");
      const tasks = await call(
        "GET",
        v2("list/" + val(a, "list_id") + "/task?page=0&subtasks=false&include_closed=true"),
      );
      const ids = Array.isArray(tasks["tasks"])
        ? tasks["tasks"]
            .slice(0, N)
            .map((x) => obj(x)?.["id"])
            .filter((x) => x !== undefined)
            .map(id)
        : [];
      if (ids.length === 0) return { source: "clickup-api-v2", tasks: [] };
      const params = ids.map((x) => "task_ids=" + x).join("&");
      return short(await call("GET", v2("task/bulk_time_in_status/task_ids?" + params)));
    }
    default:
      throw new ReadFailure("CLICKUP_TOOL_NOT_IMPLEMENTED");
  }
}
