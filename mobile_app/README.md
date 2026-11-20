# MyLife AI — mobile app

Expo + React Native + TypeScript client for MyLife AI. See the root [CLAUDE.md](../CLAUDE.md) for the product, architecture rules and roadmap.

The app holds no secrets and never calls an LLM directly. It only talks to our API.

## Run

```bash
pnpm install
cp .env.example .env              # set EXPO_PUBLIC_API_URL
open -a Simulator && pnpm ios     # native build on the iOS Simulator
pnpm start                        # dev server only (press i for iOS)
```

## Checks

```bash
pnpm typecheck
pnpm lint
```

Add packages with `npx expo install <package>` so versions match the Expo SDK.

## Structure

```
src/
  app/
    _layout.tsx        root Stack: index, (tabs), sign-in (modal)
    index.tsx          redirects to /chat (guest-first, no login at launch)
    sign-in.tsx        sign-in modal for Pro features (Supabase Auth in Phase 2)
    (tabs)/            Chat, Controls, Tasks, Inbox (approvals), Settings
    (tabs)/controls/   nested Stack: menu grid + alarms, calendar, messages, calls,
                       contacts, brightness, apps (placeholders)
  features/controls/   typed list of controls (single source for menu and titles)
  components/          shared UI (themed text/view, buttons, menu tile, control screen, placeholders)
  constants/theme.ts   colors and spacing
  hooks/               useTheme
  lib/
    config.ts          public config (EXPO_PUBLIC_API_URL)
    session.tsx        placeholder guest/signedIn session; replaced by Supabase Auth
```

Interactive elements carry kebab-case `testID`s for Maestro (`chat-input`, `send-button`, `sign-in-button`, `sign-out-button`, …).
