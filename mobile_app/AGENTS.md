This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Free (guest) features: the phone's basic apps

The app is **guest-first**: everything below is free and works without an account. Never put these behind sign-in. Only Pro features open the sign-in sheet (`src/app/sign-in.tsx`). See "Plans" and "Device control" in the root `CLAUDE.md` for the full rules and platform limits.

| Free app | Screen | Planned Expo module | Platform note |
| --- | --- | --- | --- |
| Alarms | `src/app/(tabs)/controls/alarms.tsx` | native module (AlarmKit, iOS 26+) / Android intent; `expo-notifications` fallback | iPhone: app-owned alarms only, can't see or change Clock app alarms |
| Calendar | `controls/calendar.tsx` | `expo-calendar` | Full read/write on both platforms |
| Messages | `controls/messages.tsx` | `expo-sms` | Opens a pre-filled composer; the user taps Send. Messages can't be read |
| Calls | `controls/calls.tsx` | `Linking` (`tel:`) | Opens the dialer; the user confirms. No call history |
| Contacts | `controls/contacts.tsx` | `expo-contacts` | Full on both platforms |
| Brightness | `controls/brightness.tsx` | `expo-brightness` | Screen brightness on both; Android system brightness needs `WRITE_SETTINGS` |
| Apps | `controls/apps.tsx` | `Linking`, `expo-intent-launcher` | Can open Maps, Mail, Camera, Settings…, but can't control them |

- The tile list lives in `src/features/controls/controls.ts` (single source of truth for the menu and stack titles). Add new free apps there first, then a screen in `src/app/(tabs)/controls/`.
- Every free app can also be driven from **Chat or voice**: the server agent picks a device tool and the app runs the handler in `src/device/` (Phase 3). The screens are a manual alternative, not the only way in.
- Today the screens are placeholders ("Coming in Phase 3"). Adding the modules above is a dependency change: ask the user first, then install with `npx expo install`.
- Request each permission just in time, with a usage description in `app.json`. Never request `READ_SMS`, `SEND_SMS` or `READ_CALL_LOG`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
