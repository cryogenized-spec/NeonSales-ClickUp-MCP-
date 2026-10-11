import { parseStaffAllowlist } from "../auth/staff.js";

export interface ReadGrant {
  readonly subject: string;
  readonly listId: string;
  readonly apiToken: string;
  readonly quota: {
    readonly idFromName: (name: string) => unknown;
    readonly get: (id: never) => { fetch: (request: Request) => Promise<Response> };
  };
}

export class ReadFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReadFailure";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** ClickUp grants are separate from Phase 3's GitHub login allowlist.
 * Only verified SDK authInfo is accepted; tool arguments never choose a principal or List.
 */
export function requireReadGrant(auth: unknown, bindings: unknown): ReadGrant {
  const identity = record(auth);
  const extra = record(identity?.["extra"]);
  const env = record(bindings);
  const subject = extra?.["subject"];
  const scopes = identity?.["scopes"];
  if (
    !identity ||
    !env ||
    typeof subject !== "string" ||
    !/^github:[1-9]\d*$/.test(subject) ||
    !Number.isSafeInteger(Number(subject.slice(7))) ||
    !Array.isArray(scopes) ||
    scopes.length !== 1 ||
    scopes[0] !== "mcp:read"
  ) {
    throw new ReadFailure("CLICKUP_ACCESS_DENIED");
  }
  if (env["CLICKUP_LIVE_ENABLED"] !== "true") {
    throw new ReadFailure("CLICKUP_NOT_CONFIGURED");
  }

  const listId = env["CLICKUP_LIST_ID"];
  const apiToken = env["CLICKUP_API_TOKEN"];
  const readIds = env["CLICKUP_READ_GITHUB_IDS"];
  const quota = record(env["CLICKUP_QUOTA"]);
  if (
    typeof listId !== "string" ||
    !/^[1-9]\d*$/.test(listId) ||
    !Number.isSafeInteger(Number(listId)) ||
    typeof apiToken !== "string" ||
    !apiToken.trim() ||
    typeof readIds !== "string" ||
    !quota ||
    typeof quota["idFromName"] !== "function" ||
    typeof quota["get"] !== "function"
  ) {
    throw new ReadFailure("CLICKUP_NOT_CONFIGURED");
  }

  let approved: ReadonlySet<string>;
  try {
    approved = parseStaffAllowlist(readIds);
    const loginAllowlist = parseStaffAllowlist(env["ALLOWED_GITHUB_IDS"]);
    if ([...approved].some((id) => !loginAllowlist.has(id))) {
      throw new Error("Read grant outside login allowlist");
    }
  } catch {
    throw new ReadFailure("CLICKUP_NOT_CONFIGURED");
  }
  if (!approved.has(subject.slice(7))) {
    throw new ReadFailure("CLICKUP_ACCESS_DENIED");
  }
  return {
    subject,
    listId,
    apiToken,
    quota: quota as unknown as ReadGrant["quota"],
  };
}
