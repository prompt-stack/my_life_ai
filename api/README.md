# MyLife AI API

Express 5 + TypeScript backend for MyLife AI. Phase 0 skeleton: no external
services (Supabase, Redis/BullMQ, OpenAI, Google, MCP) are connected yet. The
places they plug in are marked `TODO(Phase N)`.

See `../CLAUDE.md` for architecture rules.

## Requirements

- Node.js 24+
- pnpm 10 (`corepack enable`)

## Commands

```sh
pnpm install
cp .env.example .env      # optional; every variable has a safe default
pnpm dev                  # tsx watch, loads .env if present (node --env-file-if-exists)
pnpm typecheck
pnpm lint
pnpm test
pnpm build && pnpm start  # compiled output in dist/
```

Docker:

```sh
docker build -t mylife-api .
docker run --rm -p 3000:3000 mylife-api
```

## Endpoints

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | `{ status, version, uptimeSeconds, time }` (public) |
| any | `/chat`, `/voice`, `/tasks`, `/approvals`, `/integrations` | 501 `not_implemented` |

Every error uses one shape: `{ "error": { "code", "message", "requestId" } }`.
Each response carries an `x-request-id` header (an incoming safe ID is echoed).

## Layout

```
src/
  server.ts       entry: parse env once, build app, listen, graceful shutdown
  app.ts          createApp(deps): middleware + routes, no listen (tests use supertest)
  config/env.ts   Zod-validated env, fail fast
  routes/         thin routers (health + 501 placeholders)
  agents/         Orchestrator contract + stub (no model calls)
  tools/          tool contract, registry (validation + risk policy), get_current_time
  integrations/   google/, mcp/, search/ placeholders
  memory/         MemoryStore / EmbeddingProvider interfaces
  jobs/           queue/worker interfaces (BullMQ later)
  lib/            logger (redaction), errors, auth (TokenVerifier), http middleware
  evals/          eval case schema + example cases
  test-utils/     test app builders (excluded from build)
```

## Conventions

- Routes are thin; business logic lives in services that receive dependencies
  through factory parameters.
- User identity comes only from `res.locals.auth`, set by `requireAuth()` after
  the injected `TokenVerifier` accepts the bearer token. The default verifier
  rejects everything with 401 `auth_not_configured` until Supabase auth lands.
- Tools are plain functions first, then wrapped with `defineTool()`. Run them
  only through `ToolRegistry.execute()`, which parses arguments with Zod and
  refuses `sensitive` tools (approval flow comes in Phase 7).
- `process.env` is read only in `server.ts`.
