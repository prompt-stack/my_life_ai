# Agent evals

Prompts with expected tool calls. Run after changing prompts or models.

- Case shape: `types.ts` (`evalCaseSchema`). Examples: `cases/get-current-time.json`, `cases/alarms.json` (MyLife-owned alarms: create/update/delete/preview, sounds, closest-alarm confirmation, stop/snooze while ringing).
- Assert on outcomes (tool chosen, key arguments), never exact wording.
- Alarm tools and rules are only sent when `agents/alarm-intent.ts` sees an alarm-related request (or recent turns), or always while the phone reports `device.ringingAlarmId`; `stopAlarm`/`snoozeAlarm` are sent only while an alarm rings. `alarm-intent.test.ts` checks that every prompt in `cases/alarms.json` passes that filter, so new alarm cases must too.
- Always use a fixed `now` and an explicit `timezone` (default `Asia/Manila`).
- No runner yet. TODO(Phase 1): add one that uses the orchestrator with a mocked or dev model.

Planned example: "remind me at 9" -> `create_reminder` at 09:00 Asia/Manila.
