# Modularity, dependency direction and failure containment

**Approved engineering requirement (2026-10-10 SAST):** a modular service, not a monolith. Exact file layout is proposed until the implementation spec is reviewed.

## Boundaries

```text
transport/mcp                 entrypoint, SDK, schemas and protocol errors
   |                                      (no ClickUp credential)
   v
application/tools             tool handlers, use-case orchestration
   |            |
   v            v
application/reports           application/approvals
   |            |
   v            v
ports/                        typed interfaces: task retrieval, approval store,
   |                          clock, audit sink, token provider
   v
adapters/clickup              isolated REST client, retries, scope filters
adapters/approval-store       transactional single-use approvals
adapters/auth                 MCP OAuth / identity integration
platform/cloudflare           Worker bindings, startup and health
```

Above is a **conceptual target**, not directory scaffolding or implemented modules.

## Rules

- Dependencies flow inward toward explicit ports/use cases. Domain/report code must not import Cloudflare, MCP SDK or ClickUp HTTP packages. Transport only translates JSON schemas to applications; adapters encapsulate vendor behavior.
- Each module has a single responsibility and typed public interface. All inter-module inputs are validated at trust boundaries; typed TypeScript is not a substitute for runtime validation.
- No god file, circular module imports or global mutable business state. Avoid unexpected cross-request coupling.
- An individual tool error must not corrupt unrelated requests. External calls require timeouts, bounded concurrency, per-token rate budgets, `429` handling, retry only when safe, explicit partial-results flags and sanitized error contracts.
- No implicit writes during reads; admin-approved updates must use separate port and isolated credentials. Partial success is visible, never quietly masked.
- Injectable time, transport, auth and ClickUp adapter let independent tests validate each module without an actual account. Integration tests then verify the composition.
- Multi-client compatibility is a **transport concern**, not duplicated ChatGPT/Claude business logic.
- Add ESLint import restrictions and a dependency-graph cycle checker in the accepted TS implementation. These checks belong to CI and fail PRs when boundaries are violated; prose alone isn't enforcement.
- Avoid constructing new layers unless a real test demonstrates value; keep the smallest module that satisfies the contract.

## Code review checklist

Can each module be replaced with a test fake? Does each external call have bounded failure behavior? Can a problem with ClickUp take down the OAuth endpoint? Are permissions verified after protocol parsing? Can we test each tool independently? Does a read tool remain read-only under all inputs?

**A modular folder layout without passing import-boundary tests is not proof of modularity.**
