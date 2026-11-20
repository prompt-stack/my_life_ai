# Agent evals

Prompts with expected tool calls. Run after changing prompts or models.

- Case shape: `types.ts` (`evalCaseSchema`). Example: `cases/get-current-time.json`.
- Assert on outcomes (tool chosen, key arguments), never exact wording.
- Always use a fixed `now` and an explicit `timezone` (default `Asia/Manila`).
- No runner yet. TODO(Phase 1): add one that uses the orchestrator with a mocked or dev model.

Planned example: "remind me at 9" -> `create_reminder` at 09:00 Asia/Manila.
