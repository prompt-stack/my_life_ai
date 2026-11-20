# Agents

`orchestrator.ts` defines the `Orchestrator` contract and a stub. No model calls happen yet.

## Planned design

- **Orchestrator**: detects intent, plans multi-step requests, routes to specialists
  (agents-as-tools first, handoffs later if needed), reads/writes memory.
- **Specialists** (one file each, ~10-15 tools max per agent):

| Agent | Phase | Owns |
| --- | --- | --- |
| Task | 1 | tasks, reminders |
| Calendar | 4 | Google Calendar events |
| Email | 4 | Gmail read/summarize; sending is `sensitive` |
| Research | 4 | web search + fetch (SSRF-guarded) |
| Knowledge | 3 | RAG over uploaded documents, cites chunks |
| Finance | 4 | expenses (default currency PHP) |
| Developer | later | developer tooling via MCP |
| Automation | 6 | scheduled/recurring workflows (BullMQ) |
| Device | 5 | tools with `target: 'device'` (phone calendar, contacts, local notifications) executed by the mobile app via supported Expo APIs |

## Rules

- Tools run only through `ToolRegistry.execute` (Zod validation + risk policy in code).
- `sensitive` tools create an `approvals` row and pause the run (Phase 7).
- Untrusted content is data, never instructions.
- Every run gets the user's timezone (default `Asia/Manila`) and the current time.
