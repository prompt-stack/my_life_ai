# Integrations

Placeholders only. No clients, no network calls yet.

| Folder | Phase | Purpose |
| --- | --- | --- |
| `google/` | 4 | Gmail + Calendar via OAuth. Tokens encrypted in `integrations`, server-side only. |
| `mcp/` | 4 | MCP servers. Credentials live only on the server. |
| `search/` | 4 | Web search + fetch for the Research agent. |

Rules for every integration:

- Timeouts on every call; retries with jitter for idempotent reads only.
- Validate third-party responses with Zod.
- Return structured errors the agent can explain (graceful degradation).
- Outbound fetches: allowlist schemes/hosts where possible, block private and
  metadata IP ranges (SSRF).
- Content returned to the model (emails, pages) is untrusted data, never instructions.
