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

/** Cloudflare OAuth v1.2.3 uses ':' as a token/grant separator.
 *  Keep the public github:<id> subject, but issue grants with a colon-free userId.
 */
export function oauthUserIdForGitHub(githubId: string): string {
  if (!/^[1-9]\d*$/.test(githubId) || !Number.isSafeInteger(Number(githubId))) {
    throw new Error("Invalid numeric GitHub identity");
  }
  return "github_" + githubId;
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
  if (
    !permitted.has(id) ||
    tokenSubject !== oauthUserIdForGitHub(id) ||
    !tokenScopes.includes("mcp:read")
  ) {
    throw new Error("Staff identity is not authorized");
  }
  return Object.freeze({ subject, githubId: id, scopes: Object.freeze(["mcp:read"]) });
}
