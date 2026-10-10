# Architecture and policy decision log

**Status language:** ACCEPTED = expressly confirmed by owner; PROPOSED = written for discussion; REJECTED = ruled out; SUPERSEDED = replaced by a dated accepted decision. Do not silently promote proposals.

| ID | Date (SAST) | Status | Decision / scope | Reason or next check |
|---|---|---|---|---|
| D-001 | 2026-10-10 | ACCEPTED (user direction) | Build a real working POC **before** pitching a benefit to management | Show evidence, not speculative claims |
| D-002 | 2026-10-10 | ACCEPTED (user direction) | Maintain the project in the **private** `cryogenized-spec/NeonSales-ClickUp-MCP-` repository | Keep a persistent shared source of truth |
| D-003 | 2026-10-10 | ACCEPTED (user direction) | Support **both** ChatGPT subscription plugin and Claude subscription connector | One integration should serve both |
| D-004 | 2026-10-10 | ACCEPTED (user direction) | Establish `README.md`, `AGENTS.md` and memory-efficient working documentation **before** more app coding | Context reliability and reviewability |
| D-005 | 2026-10-10 | ACCEPTED (user direction) | Use TypeScript/npm/Node locally, Cloudflare Workers + Wrangler for deployment, official MCP SDK and OAuth | Owner said proceed; auth design still needs separate review |
| D-006 | 2026-10-10 | PROPOSED | Initial operator = one authorized owner and ClickUp allowlist = one Workspace/List | Minimize POC risk; confirm identifiers privately |
| D-007 | 2026-10-10 | PROPOSED | Read-only tools first; one disposable task may be changed only via separate human approval | No production mutation based on AI prose |
| D-008 | 2026-10-10 | PROPOSED | Keep old JavaScript POC archive as test/reference rather than silently importing all source | Different dependency/auth/security trade-offs |
| D-009 | 2026-10-10 | ACCEPTED (user direction) | Use upstream professional skills, strict review/verification and `docs/PROJECT_STATE.md` session handoff | Use upstream authored skills with provenance; no fabricated agent memory |

| D-010 | 2026-10-10 | ACCEPTED (user direction) | Target published MCP 2026-07-28 with official TypeScript SDK v2; verify official conformance and both clients | Do not implement 'MCP-like' homebrew |
| D-011 | 2026-10-10 | ACCEPTED (user direction) | Modular architecture with isolatable adapters and strict TypeScript checks | Prevent blast radius and hard-to-debug monoliths |
| D-012 | 2026-10-10 | ACCEPTED (user direction) | Strict CI with fail-closed mandatory checks and branch protection | CI alone is not enforcement; private GitHub plan may require Pro/Team |
| D-013 | 2026-10-10 | ACCEPTED (user direction) | Vendor reviewed upstream skill sources with exact revision and hashes | No handwritten agent skills; MIT attribution preserved |

| D-014 | 2026-10-10 | ACCEPTED (user direction) | Implement as discrete phases, CI green on current SHA before specialist Codex review, reserve Codex for complex errors | Avoid reviewer noise and weak evidence |
| D-015 | 2026-10-10 | ACCEPTED (user direction) | GitHub Free private repo: manual owner merge discipline rather than false claims of enforced branch protection | No paid plan; do not weaken standards |
| D-016 | 2026-10-10 | ACCEPTED (user direction) | Reuse Elara Relay engineering invariants selectively, not its entire unrelated monolithic review skill | One authority per boundary, evidence-driven exact-SHA certification |

## Record an accepted decision

Add a new row (or change PROPOSED → ACCEPTED) with the owner's actual review decision, date/time in SAST if known, trade-offs, and affected files. For changed decisions, mark original SUPERSEDED and link the replacement. Don't fabricate approval.

## Not architecture decisions

REST API rate limits, OpenAI/Anthropic account capabilities and Cloudflare product limits are **external facts** requiring periodic verification against official docs; they are not guarantees or user choices.

- ClickUp REST rate limits: https://developer.clickup.com/docs/rate-limits
- ChatGPT custom plugin integration: https://developers.openai.com/plugins/quickstart
- Claude remote connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
