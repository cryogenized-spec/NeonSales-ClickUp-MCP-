export interface AuthPrincipal {
  readonly subject: string;
  readonly githubId: string;
  readonly scopes: readonly string[];
}

export function parseStaffAllowlist(config: unknown): ReadonlySet<string> {
  if (typeof config !== "string" || !config.trim()) {
    throw new Error("Staff allowlist is not configured");
  }
  const ids = config.split(",").map((entry) => entry.trim());
  if (ids.length < 1 || ids.length > 4) {
    throw new Error("Staff allowlist must contain one to four identities");
  }
  if (ids.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
    throw new Error("Staff identifiers must be positive safe numeric GitHub IDs");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate GitHub identities are forbidden");
  }
  return new Set(ids);
}

/** Called on every protected MCP invocation, not only at initial OAuth login. */
export function requireActivePrincipal(
  props: { readonly userId?: unknown },
  tokenSubject: unknown,
  tokenScopes: readonly string[],
  allowlist: string,
): AuthPrincipal {
  const permitted = parseStaffAllowlist(allowlist);
  const subject = props.userId;
  if (typeof subject !== "string" || !/^github:[1-9]\d*$/.test(subject)) {
    throw new Error("Invalid authenticated principal");
  }
  const id = subject.slice("github:".length);
  if (!permitted.has(id) || tokenSubject !== subject || !tokenScopes.includes("mcp:read")) {
    throw new Error("Staff identity is not authorized");
  }
  return Object.freeze({ subject, githubId: id, scopes: Object.freeze(["mcp:read"]) });
}
