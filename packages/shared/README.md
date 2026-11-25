# @mylife/shared

Zod schemas and inferred TypeScript types shared by `api/` and `mobile_app/`
(CLAUDE.md: "Zod schemas shared between app and API"). Standalone pnpm package
until the repo becomes a pnpm workspace.

- Source: `src/`. Build output: `dist/` (plain ES2022 ESM + `.d.ts`, gitignored).
- `zod` is a peer dependency: each consumer provides its own `zod@^4`.
- Consumers depend on it with `"@mylife/shared": "link:../packages/shared"`.

## Build

`dist/` must exist before a consumer typechecks, tests or runs:

```sh
cd packages/shared
pnpm install   # also builds dist/ via the `prepare` script
pnpm build     # rebuild after editing src/
```

`link:` dependencies do not run this package's install scripts, so run the
commands above once after cloning and after every change to `src/`.

## Contents

| Export | Purpose |
| --- | --- |
| `VoiceTurnSchema` / `VoiceTurn` | One earlier voice turn `{ role, text }` |
| `VoiceRequestSchema` / `VoiceRequest` / `VoiceRequestInput` | `POST /voice` body |
| `VoiceResponseSchema` / `VoiceResponse` | `POST /voice` 200 body |
| `isValidTimeZone` | IANA timezone check used by the schemas |
