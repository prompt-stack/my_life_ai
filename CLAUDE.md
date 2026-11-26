# MyLife AI

Personal AI agent app for everyday life and productivity. The user speaks a request (the app is **voice-only**: no text chat) ("set an alarm for 6 AM", "text Mom I'm on my way", "add lunch with Ana tomorrow at noon", "dim the screen", "summarize my unread emails") and the agent **performs the action with real tools**, not just a text reply.

Two plans:
- **Free (guest, no account needed):** controlling the phone by voice: calendar, alarms, texts, calls, contacts, brightness and opening the phone's basic apps, plus tasks and reminders. See "Device control".
- **Pro (account required):** cloud features that need a persistent identity, such as email and calendar integrations, memory and documents, cross-device sync, and higher limits. See "Plans".

Built incrementally, phase by phase. Treat it as both a real product and a learning project: prefer clear, well-structured code over clever shortcuts.

## Current status

- **Phase:** 0 – Foundations, with the mobile UI shell ahead of schedule (update this line as phases complete)
- **Done, as of 2026-11-25:**
  - Expo app in `mobile_app/` (SDK 58, Expo Router, pnpm). It runs on the iOS Simulator (iPhone 18 Pro Max) and on Android via an **EAS development build** (`mobile_app/eas.json`, `development` profile, APK). **Expo Go no longer works** (native modules: `expo-speech-recognition`, `modules/mylife-alarms`). The repo `mobile_app/ios/` is generated and gitignored: after config-plugin changes run `npx expo prebuild --platform ios --clean` before `expo run:ios`.
  - Guest-first: the app opens straight into tabs (Assistant · Controls · Tasks · Inbox · Settings). Sign-in is a modal opened from Settings ("Sign in for Pro"). The session is a placeholder (`src/lib/session.tsx`, `guest | signedIn`).
  - Controls tab: 7 Free tiles with "Free" badges. **Alarms is real** (below); Calendar, Messages, Calls, Contacts, Brightness and Apps are still placeholders ("Coming in Phase 3") whose copy still says "just ask in Chat".
  - **Voice (app-wide):** `src/features/voice/voice-provider.tsx` (`VoiceProvider`, `useVoice()`, `useWakeWord()`) is mounted in the root layout and owns the conversation (state idle/listening/thinking/speaking/error, in-memory history max 20 turns, one recognizer shared by wake and command modes). Flow: on-device speech-to-text (`expo-speech-recognition`) → `POST /voice` (`src/lib/voice-turn.ts`, two-step device-action protocol) → reply spoken with `expo-speech`. No transcript or reply text is shown. The old `use-voice-conversation` hook is gone.
    - **Ways to start a turn** (`invocation` sent to the API): tap the orb (`tap`, kept as backup), the opt-in **"AI" trigger** (`wake_word`), and the alarm ringing screen's Speak button / `mylifeai://assistant?voice=1` deep link (`speak_button`).
    - **"AI" trigger:** opt-in "Listen for 'AI'" switch in Settings (off by default) plus a one-time prompt card on the Assistant. Continuous on-device recognition on every screen while the app is active and idle; `src/lib/wake-word.ts` `detectTrigger()` matches the standalone word "AI" (also "A.I.", "a i", "ay eye"; not "said"/"rain"); "AI, set an alarm for 6" runs directly, "AI" alone starts listening. Pauses while speaking, during command listening and in the background (Android keeps listening during a ringing alarm with the ring ducked; in-app ringing overlay `src/features/alarms/components/ringing-overlay.tsx`); command listening waits 8 s for speech, submits 4.5 s after the last word; a `__DEV__`-only "What the mic heard" panel in Settings shows recent wake transcripts (memory only); restarts with backoff; no network fallback (missing offline language pack → "Download offline speech" setup). The server also strips a leading "AI"/"Hey AI" on `wake_word` turns (`api/src/agents/wake-word.ts`; bare "AI" → "Yes? What can I do for you?" without a model call).
    - **Floating indicator** (`src/features/voice/components/voice-indicator.tsx`): a pill above the tab bar on non-Assistant screens showing listening/thinking/speaking (errors only for turns started off the Assistant; errors reset to idle after 4 s).
    - **Guards:** iOS Simulator never starts the audio engine (native abort) and shows "Voice input isn't available on the Simulator"; permission, availability and recognizer error events map to short status text.
  - **MyLife-owned alarms** (Android + iOS 26+; Clock-app intents removed). Native module `mobile_app/modules/mylife-alarms` (vendored/trimmed from MIT `react-native-alarm-scheduler`; config plugin `app.plugin.js`): Android `setAlarmClock` + `specialUse` ringing foreground service (looping sound, `USAGE_ALARM`, volume ramp, vibration, 10-min auto-stop) + full-screen ringing screen (Stop, Snooze 9 min, Speak) + boot/time-change rescheduling, alarms persisted natively; iOS AlarmKit (alert-only: Stop + Open, no snooze). Sounds: 5 self-generated instrumentals (`scripts/alarm-sounds/generate.py`, stdlib only): Sunrise (default), Chimes, Marimba, Piano, Guitar.
    - **Alarms page** (Controls → Alarms): list with on/off switch, create/edit screen (time steppers, label, repeat days, sound), sound picker with tap-to-preview (`expo-audio`), delete with confirm, and an Android setup checklist (notifications, "Alarms & reminders", full-screen alerts, battery, Xiaomi Autostart; iOS "Allow alarms").
    - **Voice device tools:** `createAlarm`, `updateAlarm`, `deleteAlarm`, `previewAlarmSound`, and `stopAlarm`/`snoozeAlarm` (offered only while an alarm rings). The app sends its alarm list, `alarmPermissions` and `ringingAlarmId` in `device`. Server code resolves the target alarm (exact match acts; closest is confirmed first: "Your closest alarm is 9:00 PM. Delete that one?"), only sets a sound the user names (aliases like "the piano one"; vague → asks), snooze minutes only when a number is said (default 9). While listening during a ringing alarm the sound pauses and auto-resumes after 20 s. Failure replies are fixed text per error code.
    - Verified live against Groq for all voice paths; the iOS Simulator build compiles and bundles the sounds, but AlarmKit denies authorization there, so create/edit/delete/ringing are **untested**; the Android Kotlin has **never been compiled** (no Android SDK here; first EAS build may need fixes).
  - Theme tokens with light/dark mode and borders on surfaces. Android: Material (`md`) icons, always-visible tab labels, and a force-dark opt-out plugin (applies in dev/prod builds only, not Expo Go).
  - Maestro: `.maestro/skeleton.yaml` passes on the iOS Simulator (its orb step asserts the Simulator guard status). Mobile typecheck and lint pass (0 warnings). There's no mobile unit test runner yet.
  - Claude agents in `.claude/agents/`: researcher, backend-engineer, database-engineer, frontend-engineer, mobile-tester.
- **API** in `api/` (Express 5 + TypeScript): `GET /health`; **`POST /voice`** (text + history + `device` + optional `invocation`/`toolResult` → Groq → `{ reply, deviceAction? }`; 20 req/min per IP; structured errors `ai_not_configured` 503 / `ai_rate_limited` 429 / `ai_timeout` 504 / `ai_upstream_error` 502; **no auth yet**). Prompt kept small: base prompt (~270 tokens) for general requests; alarm rules + alarm tools (~1,560–1,740 tokens) only when `isAlarmRequest()` matches or an alarm is ringing (`api/src/agents/voice-prompts.ts`, `alarm-intent.ts`; budget test `voice-prompt-size.test.ts`). Groq 429s are not retried (fast `ai_rate_limited` instead of an 18 s wait). Per-call info logs (latency, tokens, Groq timings, invocation; never user text). 501 placeholders for chat/tasks/approvals/integrations; Vitest tests (678 passing); eval cases in `api/src/evals/cases/alarms.json` (no runner yet). Listens on `HOST=0.0.0.0` so a phone on the same Wi-Fi can reach it.
- **`packages/shared`** (`@mylife/shared`): Zod schemas for the voice contract (`VoiceRequestSchema` incl. `invocation`, `VoiceResponseSchema`), device tools (`packages/shared/src/device.ts`) and alarms (`packages/shared/src/alarms.ts`: sounds + aliases, `AlarmSchema`, tool args, permissions), built with `tsc` to `dist/` and linked into `api/` and `mobile_app/` via `link:` (Metro `watchFolders` in `mobile_app/metro.config.js`).
- **Not started:** Supabase (auth, DB, `agent_runs` logging), Redis/BullMQ, deployment, pnpm workspace.
- **Open issues:** nothing verified on the Poco yet (EAS dev build pending; Kotlin uncompiled); HyperOS may kill alarms/reboot rescheduling without Autostart; AlarmKit custom sounds are buggy on some iOS 26.x versions and untested on a real iPhone; no "missed alarm" notification after the 10-min auto-stop; ringing-screen strings are English only; "AI" said mid-sentence also starts listening, and continuous listening costs battery (measure on the Poco); the pill uses a fixed tab-bar height (`BottomTabInset`); Groq free tier (8K tokens/min) allows only ~5 alarm requests per minute; alarm prompt has ~17 tokens of budget headroom; `/voice` has no auth (anyone on the LAN can spend Groq quota, within the per-IP limit) until Phase 1; the API Dockerfile no longer builds because `@mylife/shared` is outside its build context; a `preview` (release) APK blocks cleartext `http://` to the LAN API; Android sound files are bundled twice (res/raw + Metro preview assets, ~6 MB); light mode of the new alarm screens not checked; Android tab icons not yet confirmed; an intermittent iOS cold launch landed on the wrong tab once; light-mode primary button contrast is 3.5:1; badge testIDs always end in `-free-badge`.
- **Next milestone:** on the Poco F9 Pro (new EAS dev build): fix any Kotlin compile errors, then verify alarms end to end (create/edit/delete from the page and by voice, ringing over the lock screen, Stop/Snooze/Speak, voice stop/snooze, reboot), the "AI" trigger and battery; then Phase 1: Supabase auth + tasks, with `/voice` protected by `requireAuth`.
- Build order: Step 0 skeleton → Phase 1 backend chat + tasks → Phase 2 mobile shell + guest mode → Phase 3 device control (Free) → Phase 4 orchestrator/memory/RAG → Phase 5 integrations (Pro) → Phase 6 voice/push → Phase 7 approvals/scheduling/evals/Pro billing → Phase 8 release
- Build in **thin vertical slices**: one feature end to end (DB → tool → agent → API → screen) before starting the next.

## Tech stack

| Area | Choice |
| --- | --- |
| Mobile | Expo + React Native + TypeScript, Expo Router |
| Mobile state/data | TanStack Query (server data), Zustand (small UI state) |
| Backend | Node.js + TypeScript (Express 5) |
| AI provider | **Groq** via `groq-sdk` (free tier), server-side only. Model is set in `api/.env` (`GROQ_MODEL`, default `openai/gpt-oss-20b`; `openai/gpt-oss-120b` for smarter replies). Groq retires models often: check its deprecations page |
| AI orchestration | To be decided in Phase 4 (originally OpenAI Agents SDK; it would need to work with Groq's OpenAI-compatible API). LangGraph only later, if needed |
| Speech | On-device: `expo-speech-recognition` (speech-to-text, needs Google speech services on Android) and `expo-speech` (text-to-speech) |
| Tool integration | Native function tools + MCP |
| Database | Supabase Postgres + pgvector |
| Auth | Supabase Auth (session stored with `expo-secure-store`) |
| Background jobs | BullMQ + Redis |
| Realtime | Supabase Realtime |
| Push | Expo push notifications |
| Validation | Zod (schemas shared between app and API) |
| Testing | Vitest (unit/integration), Maestro (mobile E2E) |
| Web (later) | Next.js admin / activity dashboard |
| Deploy | Docker, AWS EC2; mobile via EAS Build/Submit |

## Repo layout

Current layout: standalone pnpm projects at the repo root (`mobile_app/`, `api/`, `packages/shared/`), with `packages/shared` linked into the other two via `link:`. A pnpm workspace + Turborepo comes later.

```
mobile_app/      Expo app (Expo Router: src/app/(tabs), src/app/sign-in modal)
api/             Node.js + TypeScript + Express API, agents, tools (BullMQ workers later)
web/             Next.js dashboard (later)
packages/
  shared/        @mylife/shared: Zod schemas + TypeScript types used by mobile_app and api (build to dist/ with `pnpm build` after editing src/)
.maestro/        Maestro E2E flows (YAML)
.claude/         Claude Code settings, agents, commands
```

API internals:

```
api/src/
  server.ts      entry: config, listen, graceful shutdown
  app.ts         createApp(deps) factory (used by tests via supertest)
  config/        Zod-validated environment
  routes/        health, chat, voice, tasks, approvals, integrations
  agents/        orchestrator.ts + one file per specialist agent
  tools/         one file per tool: Zod schema + implementation + risk level + target (server/device)
  integrations/  google/, mcp/, search/
  memory/        remember, recall, embeddings
  jobs/          BullMQ queues and workers (reminders, workflows)
  lib/           logger, errors, http middleware, auth, supabase, tracing
  evals/         test prompts + expected tool calls
```

## Commands

<!-- Update these as scripts are added. Until the workspace exists, run commands inside mobile_app/ or api/ -->
- Install: `pnpm install` in `packages/shared/` first (its `prepare` script builds `dist/`), then in `api/` and `mobile_app/`. Re-run `pnpm build` in `packages/shared/` after changing its `src/`
- Type check: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test` (not set up yet: no unit test runner; ask before adding one)
- API dev server: `pnpm dev` (in `api/`); API checks: `pnpm typecheck && pnpm lint && pnpm test` (in `api/`)
- Mobile (iOS Simulator): `open /Applications/Xcode.app/Contents/Applications/DeviceHub.app && npx expo run:ios --device "iPhone 18 Pro Max"` (from `mobile_app/`; in this Xcode the Simulator UI app is named DeviceHub, so `open -a Simulator` fails)
- Mobile dev server only: `npx expo start --dev-client` (press `i` for iOS; on Android open the installed dev build and connect)
- Android dev build (Poco F9 Pro; no Android SDK on this Mac): `npx eas-cli build --profile development --platform android` from `mobile_app/` (the user runs it: needs their Expo login), then install the APK on the phone
- Phone → API: dev builds auto-detect the Mac's LAN IP from the Metro connection (`src/lib/config.ts` `resolveApiUrl`, API port 3000 or `EXPO_PUBLIC_API_PORT`), so an IP change only needs an app reload. `EXPO_PUBLIC_API_URL_OVERRIDE` forces a URL in dev (e.g. tunnels); `EXPO_PUBLIC_API_URL` in `mobile_app/.env` is used by release builds and as the dev fallback. Restart Metro after changing `.env`
- AI config: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_MAX_TOKENS`, `GROQ_REASONING_EFFORT` in `api/.env` (server only; see `api/.env.example`)
- E2E flows: `~/.maestro/bin/maestro test .maestro/` (Metro must be running; Maestro is not on PATH by default). On iOS, use `waitForAnimationToEnd` after navigation and tap the header back button (Maestro `back` doesn't work on iOS)

**A task is done only when typecheck, lint and tests pass.**

## Architecture rules (non-negotiable)

1. **The phone never holds secrets.** No AI provider keys (Groq or others), Google tokens or MCP credentials in the mobile app. The app holds only a Supabase session (anonymous for guests, permanent for account holders) and talks only to our API.
2. **All LLM calls run on the server.** The mobile app never calls Groq or any model directly (on-device speech-to-text and text-to-speech are not LLM calls). This includes guests and device control: the server agent decides, and the phone executes (rule 8).
3. **The server does the scheduling.** Reminders and recurring agents run as BullMQ jobs and reach the phone as push notifications. Do not rely on mobile background tasks.
   **Exception (approved 2026-11-25):** user-set alarms are scheduled on the device by the OS alarm service (Android `AlarmManager.setAlarmClock`, iOS 26+ AlarmKit) through the app's own native module `mobile_app/modules/mylife-alarms`, because they must ring offline and while the app is closed. The server agent still decides (rule 8): it calls the alarm device tools, and the phone executes and persists them natively. All other reminders stay server-scheduled (BullMQ + push).
4. **Every tool is a typed function first.** Write and test the plain function (e.g. `createTask()`), then expose it as an agent tool. Validate all tool arguments with Zod. Tools never trust the model's input.
5. **Risky actions require approval.** Each tool declares a risk level: `read`, `write` or `sensitive`. Sensitive tools (send email, delete data, spend money, change production) create an `approvals` row and pause the run until the user approves in the app.
6. **Log every run.** Each agent run and tool call is written to `agent_runs` / `tool_calls` (input, tools, tokens, latency, errors).
7. **User identity comes from the verified Supabase JWT**, never from the request body. Every table has `user_id` and Row Level Security. Guests use **Supabase anonymous sign-in**, so they also have a JWT and `user_id`. Pro features check the plan on the server (`is_anonymous` claim + `profiles.plan`), never just in the UI.
8. **Device actions run on the phone, decided by the server.** The server agent calls a *device tool* (e.g. `createAlarm`). The API streams it to the app as a `device_action` event. The app validates the arguments with the shared Zod schema, executes it with an on-device handler, and sends the result back so the agent can continue. The phone never acts on model text directly, and only allowlisted device tools exist.
9. **The user stays in control of the phone.** Device tools declare a risk level like server tools. Sending a message, placing a call, deleting calendar events or contacts, and anything that contacts another person always needs an explicit on-device confirmation. On iOS the OS also enforces this. Runtime permissions are requested just in time, with a clear reason, and a denial must be handled gracefully.

## Plans: Free (guest) vs Pro

Guests can use the app immediately with no sign-up. Sign-in is only requested when the user opens a Pro feature, through a sign-in sheet shown at that moment, not a gate at launch.

| Free (guest, anonymous session) | Pro (account required) |
| --- | --- |
| Chat and voice commands with a daily message limit | Higher or unlimited chat and voice limits |
| Device control (see below) | Email integration (Gmail): read, summarize, draft, send with approval |
| Tasks and reminders | Cloud calendar integration (Google Calendar), beyond the on-device calendar |
| On-device calendar and contacts | Long-term memory and documents (RAG) |
| | Cross-device sync, chat history backup, recurring scheduled agents/workflows |
| | Expense tracking and reports |

- **Upgrading keeps data:** linking an email, Apple or Google identity to the anonymous user (Supabase identity linking) keeps the guest's tasks and chats.
- **Server enforcement:** every Pro route and tool checks the plan on the server and returns a structured `pro_required` error. The app turns that error into the sign-in/upgrade sheet.
- **Billing (Phase 7):** digital subscriptions on iOS and Android must use App Store / Google Play in-app purchases. Ask before choosing a billing library.
- **Guest abuse and cost control:** rate limit per anonymous user and per device/IP, and clean up inactive anonymous users and their data.

## Device control (Free tier)

Device control uses the agent tool pattern (rule 4), but each tool's handler runs **in the mobile app**. Its schema lives in `packages/shared`, the server exposes the tool to the agent, and the app's `src/device/` registry executes it.

**Platform limits.** These are OS and store rules, not choices we can work around. Verify against current Expo/Apple/Google docs before implementing.

| Capability | iOS | Android | How |
| --- | --- | --- | --- |
| Calendar events (read/create/edit/delete) | ✅ | ✅ | `expo-calendar` |
| Contacts (look up, create) | ✅ | ✅ | `expo-contacts` |
| Alarms | ✅ iOS 26+: app-owned alarms via AlarmKit (`modules/mylife-alarms`; v1 has Stop only, snooze needs a widget extension later). ❌ Below iOS 26 (a notification is not an alarm). Can't read or set Clock app alarms | ✅ App-owned alarms via `AlarmManager.setAlarmClock` + foreground ringing service (`USAGE_ALARM`, looping bundled sound) + full-screen ringing screen, rescheduled on boot/time change (`modules/mylife-alarms`). Needs user grants: "Alarms & reminders" (`SCHEDULE_EXACT_ALARM`), full-screen alerts, notifications; on Xiaomi/OEMs also Autostart/battery settings. The Clock-app intents were removed (Clock apps ignore dismiss/edit, e.g. Xiaomi) | approved native module (vendored and trimmed from MIT `react-native-alarm-scheduler`); `expo-audio` for sound previews |
| Timers | ⚠️ Same as alarms | ✅ `ACTION_SET_TIMER` intent | as above |
| Send a text message | ⚠️ Opens a pre-filled composer; the user taps Send | ⚠️ Same (composer). Silent sending needs `SEND_SMS`, which Play only allows for default SMS apps, so not planned | `expo-sms` |
| Read text messages | ❌ No API | ❌ `READ_SMS` is Play-restricted to default SMS apps; not planned | none |
| Place a call | ⚠️ Opens the dialer with the number; the user confirms | ⚠️ Same (`ACTION_DIAL`) | `Linking` (`tel:`) |
| Read call history | ❌ No API | ❌ `READ_CALL_LOG` is Play-restricted; not planned | none |
| Ringtone | ❌ No API | ⚠️ `RingtoneManager` + special `WRITE_SETTINGS` permission | native module (Android only) |
| Screen brightness | ✅ Screen brightness | ✅ App brightness; system brightness with `WRITE_SETTINGS` | `expo-brightness` |
| Volume, Do Not Disturb, Wi-Fi/Bluetooth toggles | ❌ No public API | ⚠️ Volume via `AudioManager`; DND needs notification-policy access; Wi-Fi/BT only via settings panels | native module (Android only) |
| Open basic apps (Maps, Mail, Phone, Messages, Settings, Camera, browser) | ⚠️ Open via URL schemes / universal links; can't control the other app once it's open | ⚠️ Open via intents; same limit | `Linking`, `expo-intent-launcher`, `expo-web-browser` |
| Camera / photos, location, flashlight | ✅ | ✅ | `expo-camera`, `expo-image-picker`, `expo-location` |
| "Hey Siri / Google Assistant, ask MyLife…" | ⚠️ App Intents / Shortcuts (native, later) | ⚠️ App Actions (later) | later phase |

Legend: ✅ fully possible · ⚠️ partial / needs user confirmation or a native module · ❌ not possible for App Store / Play apps.

Rules for device tools:
- **Capability detection:** the app reports its platform, OS version and granted permissions with each chat request. The server only offers the agent device tools that are available. When something isn't possible, the agent says so honestly and offers the nearest alternative (e.g. "I can't change your ringtone on iPhone, but I can open Sound settings").
- **Voice trigger "AI" (approved 2026-11-25):** an opt-in "Listen for 'AI'" toggle (off by default) enables app-wide listening on every screen while MyLife is open in the foreground. Recognition runs on-device (no audio leaves the phone before the trigger); it pauses while the app speaks and in the background. While an alarm rings with MyLife open (Android), the alarm shows as an in-app overlay instead of the full-screen screen, the ring is ducked to ~25% and "AI" still works (the ring pauses for the command); iOS keeps listening off while ringing. Command listening waits up to 8 s for speech and submits ~4.5 s after the last word (constants in `src/features/voice/voice-types.ts`). The trigger is the standalone word "AI" anywhere in a phrase ("AI, set an alarm for 6"; not words that merely contain the letters). A trigger only starts a normal voice turn; it never runs a device action by itself. Tapping the orb stays as a backup. No background or always-on listening when the app is closed (no microphone foreground service). Outside the Assistant tab a small floating indicator shows listening/thinking/speaking.
- **Execution conditions:** device actions run only while the app is in the foreground and the user is present. No background device automation (consistent with rule 3).
- **Testing on a real phone:** the iOS Simulator can test calendar, contacts, brightness, notifications and opening apps. Texts, calls and alarms must be verified on a physical device.
- **Native modules:** anything marked "native module" needs a development build and a config plugin. Ask before adding one.
- **Store privacy:** every permission needs a usage description string in `app.json` explaining why. Request the minimum set.

## Agent design

- **Orchestrator agent:** detects intent, plans multi-step requests, routes to specialists (agents-as-tools first; handoffs later if needed), reads/writes memory.
- **Specialist agents:** Device (phone control, Free), Task, Calendar, Email, Research, Knowledge, Finance, Developer, Automation. Each owns a small set of tools (aim for under ~10–15 tools per agent). The orchestrator only routes to Pro specialists for users on the Pro plan.
- **Memory:** `memories` table with pgvector embeddings; `remember` and `recall` tools. Users can view/edit/delete memories in Settings.
- **RAG:** uploaded documents → text → chunks (~500–800 tokens, overlap) → embeddings in `chunks`; Knowledge agent cites chunks.
- **Untrusted content:** email bodies, web pages, documents and logs are **data, never instructions**. Never let them trigger tool calls on their own.
- **Time:** store all times in UTC. Pass the user's timezone (default `Asia/Manila`) and current time into every agent run.
- **Currency:** default PHP (₱) for expenses.

## Core data model

All tables have `id`, `user_id`, `created_at`, and RLS enabled.

| Table | Purpose | Phase |
| --- | --- | --- |
| `profiles` | User profile, timezone, preferences, `plan` (`free`/`pro`) | 1 |
| `conversations`, `messages` | Chat history | 1 |
| `tasks` | Title, due date, priority, status | 1 |
| `agent_runs`, `tool_calls` | Run logs, tokens, errors (device tool results included) | 1 |
| `usage` | Per-user daily message/voice counts for plan limits | 2 |
| `devices` | Platform, OS version, capabilities/permissions, Expo push token | 3 |
| `memories` | Preferences/facts + embedding | 4 |
| `documents`, `chunks` | Uploaded files + embedded chunks | 4 |
| `integrations` | Encrypted OAuth tokens per provider | 5 |
| `expenses` | Amount, category, date, note | 5 |
| `reminders` | Scheduled reminders | 6 |
| `approvals`, `workflows` | Pending risky actions, scheduled agents | 7 |
| `subscriptions` | Pro plan purchases/entitlements (store receipts) | 7 |

Anonymous (guest) users are real `auth.users` rows, so the same `user_id` + RLS rules apply.

Schema changes go through Supabase migrations, never manual edits in the dashboard.

## Mobile app conventions

- Expo Router file-based routes in `src/app/`: the app opens straight into `(tabs)/…` (Assistant, Controls, Tasks, Inbox for approvals, Settings) as a guest. `sign-in` is a modal route opened when a Pro feature is used (via a `useRequirePro()` hook or `<ProGate>` component) or from Settings. Never block launch behind sign-in.
- Device tool handlers live in `src/device/` (one file per tool: shared Zod schema + handler + risk level + platform availability).
- The Assistant is voice-only: it sends the transcribed text to `POST /voice` and speaks the reply. It doesn't display messages. (Streaming and tool-call cards may come later.)
- Every interactive element that tests use gets a `testID` (kebab-case, e.g. `voice-orb`, `voice-status`, `task-row-<id>`, `approve-button`).
- Types for API requests/responses come from `packages/shared`; never redefine them in the app.
- Approved custom native module: `modules/mylife-alarms` (app-owned alarms, Android + iOS 26+). Alarm sounds are 5 bundled, self-generated instrumentals: Sunrise (default), Chimes, Marimba, Piano, Guitar.
- Device integrations use Expo modules first (`expo-calendar`, `expo-contacts`, `expo-sms`, `expo-brightness`, `expo-notifications`, `expo-speech`, `expo-location`, `expo-intent-launcher`, `Linking`). Use custom native modules only where the table in "Device control" says so, and ask first. Never request `READ_SMS`, `SEND_SMS` or `READ_CALL_LOG`: Google Play rejects them for non-default SMS/phone apps, and iOS has no equivalent.

## Code conventions

- TypeScript `strict` everywhere; no `any` unless justified in a comment.
- Zod schema first, infer types from it (`z.infer`).
- Small, focused files; one tool per file in `tools/`.
- Async errors are caught and logged with context; tools return structured errors the agent can explain.
- Environment variables are listed in `.env.example`; never commit real `.env` files.
- Write tests alongside new tools and API routes.

## Testing

- **Unit/integration:** Vitest for tools, routes and agents (mock the model where possible).
- **Agent evals:** prompts in `api/src/evals/` with expected tool calls (e.g. "remind me at 9" → `createReminder` at 09:00 Asia/Manila). Run after changing prompts or models.
- **Mobile E2E:** Maestro via the Maestro MCP server on the booted **iOS Simulator** (Android emulator later). Use the `mobile-tester` agent. Save passing journeys to `.maestro/<feature>.yaml`.
- Agent replies vary between runs: assert on outcomes (task created, approval card shown, tool card text), not exact wording.
- Use a dedicated test account and dev backend. Never test against real email, calendars or production data.
- Test both modes: **guest** (Free features work with no sign-in; Pro features open the sign-in sheet) and **signed-in Pro**. Device tools need tests for granted, denied and unavailable-on-this-platform cases.
- Never send real texts or place real calls in automated tests. Assert that the composer or dialer opens with the right content, then cancel.

## How to work in this repo (instructions for Claude)

- Work on **one plan step at a time**. For anything non-trivial, propose a short plan first and wait for approval.
- Keep changes small and focused; don't refactor unrelated code.
- Run typecheck, lint and tests before saying a task is done. Report what you ran.
- Ask before adding a new dependency, changing the database schema, or changing the architecture rules above.
- Never touch production resources, real user data, or credentials. Use dev Supabase and test accounts only.
- Never put secrets in code, logs, `.claude/` files or commits.
- When unsure about current library APIs (Expo, Groq, Supabase), check the official docs instead of guessing.
- **Route every task to the matching agent** (see "Agent routing" below). Don't do specialist work in the main conversation.

## Agent routing

For every user prompt, first classify the task, then delegate to the matching agent in `.claude/agents/`. The main conversation acts as the **coordinator**: it plans, delegates, checks results, and reports back to the user. It does not do specialist work itself.

| If the task is about… | Delegate to | Examples |
| --- | --- | --- |
| Research, comparisons, feasibility, "best way/library/model", versions, pricing, platform/store rules, AI-integration approaches | `researcher` | "research speech-to-text options", "can iOS set alarms?", "which embedding model?" |
| Database: tables, migrations, RLS, indexes, constraints, RPC functions, pgvector, slow queries | `database-engineer` | "add an expenses table", "why is the tasks query slow?" |
| API / server: Express routes, services, agent orchestration, agent and device tool definitions, BullMQ jobs, caching, integrations, auth, plan enforcement | `backend-engineer` | "add POST /chat", "create the createAlarm device tool", "add rate limiting" |
| Mobile app: screens, components, navigation, themes, data fetching, realtime, device action handlers in `src/device/`, guest/Pro gating UI | `frontend-engineer` | "build the Tasks screen", "add dark mode toggle", "show sign-in sheet for Pro" |
| Testing the app: run or extend Maestro flows, explore features, find bugs and UX issues | `mobile-tester` | "test the app", "check the chat flow for bugs" |

**Tasks that span several areas** (most features, built as vertical slices): break them into steps and delegate each step in dependency order, passing each agent the outputs it needs (schemas, endpoints, file paths):
1. `researcher`: only if an approach, library or feasibility question is open
2. `database-engineer`: schema, RLS, migration (needs user approval)
3. `backend-engineer`: shared Zod schemas, tools, routes, tests
4. `frontend-engineer`: screens, hooks, testIDs
5. `mobile-tester`: verify the journey end to end; save the flows it proposes to `.maestro/`

Run independent steps in parallel (e.g. researching two separate questions). Run dependent steps in sequence.

**Coordinator rules**
- Before delegating a non-trivial or multi-agent task, show the user a short plan (steps → agents) and wait for approval, per "How to work in this repo".
- Give each agent a self-contained brief: the goal, the relevant context and decisions already made, the files involved, constraints, and what to return. Agents don't see this conversation.
- After each agent finishes, check its result (diff, command output, report) before moving on. Then relay the outcome to the user: what changed, what was verified, open issues. Don't just forward the raw report.
- If an agent reports a bug or gap in another area, route a fix to the owning agent, then re-run `mobile-tester` for user-facing changes.
- Agents that are read-only (`researcher`, `mobile-tester`) propose files. The coordinator writes them (e.g. saving Maestro flows or doc text).
- **Handle directly without an agent:** questions about the conversation itself, quick explanations of existing code, git operations (commit, branch, status), and edits to `CLAUDE.md` or `.claude/` config.
- If a task fits no agent, say which agent is closest or do it directly, and mention it.
- After finishing a phase step, suggest updating the "Current status" section above.

## Out of scope for now

- LangGraph, plugin marketplace, custom agent builder, multiple AI providers at once (Groq is the single provider for now): later phases only.
- Anything the "Device control" table marks ❌: reading SMS or call history, silent sending or calling, controlling other apps' internals, and background device automation.
- Becoming the default SMS/phone app on Android, or Android Accessibility-service automation (Play policy restricts both).
