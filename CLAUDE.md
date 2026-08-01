# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root unless noted. `npm run dev` already runs `npm install` — don't run it separately.

```bash
npm run dev        # deps + build @core/shared + postgres/redis/migrate in docker + api & web with hot reload
npm run start      # full containerised stack (docker compose up -d --build)
npm run stop       # docker compose down

npm test           # node --test on tests/ + every workspace suite
npm run lint       # eslint per workspace + prettier --check .   <-- prettier is part of lint
npm run typecheck  # tsc per workspace
npm run build      # build every workspace
npm run format     # prettier --write .

npm run storybook -w frontend-application/task-app        # design-system catalogue on :6006
npm run build-storybook -w frontend-application/task-app  # static catalogue into storybook-static/
```

Storybook covers `src/shared/components/**` only — feature components are store- and router-wired
and are documented by their specs instead. Global styles, i18n and the `data-theme` switcher are
installed once in `.storybook/preview.tsx`; a story never wraps itself in those providers.

**Green gate before any push:** `npm test`, `npm run lint`, `npm run build`, `npm run typecheck` — all from the root. Workspace-level eslint alone misses the root `prettier --check .`, and CI fails on it.

**Build `@core/shared` first** after touching it (`npm run build -w @core/shared`). Type-aware ESLint and typecheck resolve the shared lib through its compiled `dist/`, so a stale build produces phantom errors in both consumers.

### Single test / single workspace

```bash
npm run test -w backend-services/task-service                       # jest, all backend specs
npm run test -w backend-services/task-service -- tests/unit/task/task.service.spec.ts
npm run test -w backend-services/task-service -- -t "changeStatus"  # by test name
npm run test -w frontend-application/task-app -- src/features/tasks/stores/useTaskStore.spec.ts
npm run test -w backend-services/libs/core/shared
```

Backend jest matches `tests/**/*.spec.ts` — that glob includes `tests/integration/` and `tests/api/`, which need a live Postgres via `DB_URL` (and Redis via `REDIS_URL`). Suites gate on `isTestDatabaseConfigured()` and skip cleanly when it's unset. Integration rows carry the `zztest_` prefix and cleanup deletes exactly that prefix, so pointing `DB_URL` at a shared database is safe.

### Migrations

Migrations run **only** in the compose `migrate` job — never on backend boot (`migrationsRun: false`). Manually: `npm run migration:run:dev -w backend-services/task-service` against a running DB.

## Architecture

npm workspaces monorepo. Three workspaces:

- `backend-services/libs/core/shared` (`@core/shared`) — framework-level building blocks, imported by **both** sides.
- `backend-services/task-service` — NestJS REST API + Socket.IO gateway.
- `frontend-application/task-app` — React 19 + Vite SPA.

### The core idea: a type-agnostic workflow engine

A task has a **type**; a type declares ordered **statuses**; each status declares the **fields** required to advance into it. The engine (transitions, validation, history, realtime) knows nothing about any concrete type. Adding a type = add a `TaskTypeDefinition` class under `task-type/definitions/` and append it to `TASK_TYPE_DEFINITION_CLASSES` in `definitions/index.ts` — that array is the _single_ registration point (module providers and the aggregate injection both derive from it, so half-registration is unrepresentable). `finalStatus` is **derived** as the last status, never declared. `TaskTypeRegistry` fail-fast-validates every definition at bootstrap. Never special-case a type name in engine code.

### Backend layering

`Controller → Service → DAO → Entity`, with a hard translation boundary:

- **Controllers stay thin** — validate in, delegate, reshape to the wire DTO out. No business logic. Reusable HTTP concerns (ETag / conditional GET) live in `@core/shared` as interceptors that endpoints just declare.
- **Services own transactions.** Every mutation opens its own explicit transaction in `TaskService`. `changeStatus` takes a pessimistic row lock, then checks in a fixed order: closed → `expectedStatus` CAS (409 `TASK_STATE_CONFLICT`) → transition arithmetic → field validation → assignee → single UPDATE → history append.
- **DAOs extend `BaseDao<TEntity, TDomain>`** and map entities to domain models — _entities never cross into the service layer_. `BaseDao` splits `readRepository` / `writeRepository` from day one (same DB unless `DB_READ_URL` is set) and owns generic helpers (`findOneOrThrow`, `updateByIdReturning`, save-then-map). Put a repeated DAO pattern in `BaseDao`, not in each concrete DAO.
- **Domain models** (`domain/task.model.ts`) have private fields and validating setters that throw `ValidationException`.

### Errors

`@core/shared/error-codes` is THE registry, imported directly by backend _and_ frontend — no mirror copy, no parity test. `errorCode = HTTP status × 100 + serial` (`40901` = "409, variant 01"). Append inside a status block; **never renumber** — the number is public contract. Every typed exception carries an `ErrorCode` enum member, never a literal. Wire envelope: `{ errorCode, errorMessage, details? }`.

The client never renders the server's `errorMessage` — `ERROR_TEXT_KEYS` maps each `ErrorCode` to client copy, and `resolveErrorText` falls back to generic text for unmapped / `INTERNAL_ERROR` / network failures.

### Pagination

Keyset (cursor), never OFFSET — O(log n) at any table size. Cursors are opaque and validated on decode; malformed → `400 VALIDATION_ERROR`. Index column order must match the sort direction exactly (task pages are all-DESC on `(assigned_user_id, created_at, id)`; history is oldest-first on `(created_at, id)`).

### Realtime

Socket.IO namespace `/realtime`, fanned out across instances via the Redis adapter. Rooms: `task:{id}` and `user:{id}`. `TaskEventsPublisher` is the single emit funnel and is called **only after the transaction commits**, wrapped in a log-and-swallow try/catch (the one sanctioned swallow — realtime must never fail a write). `updatedAt` is a fixed-length microsecond UTC ISO string, shared by REST and socket payloads; the client compares it lexicographically as a staleness guard.

### Frontend layering

`view → component → store → service`, feature-first under `src/features/<feature>/`.

- `BaseHttpService` owns all transport (base URL, timeout, axios → typed `ApiError`). Domain services extend it and only call `get/post/patch` with relative paths.
- Request/response DTOs live in a dedicated `*.dto.ts` owned by the service — not in the feature `types.ts`.
- Zustand stores: actions return `Promise<boolean>`, the `catch` is **terminal** (set error, toast via the resolver, `TASK_STATE_CONFLICT` → auto-refetch). Stores expose a `reset()`.
- All user-visible text goes through i18n. `core/i18n` auto-aggregates co-located `locales/en.json` files via `import.meta.glob`, scope derived from path; use the scoped `useTranslation(scope)` wrapper.
- Shared design-system components in `src/shared/components/`; styling uses theme tokens from `src/styles/_themes.scss` only — no hard-coded colors.
- Cross-cutting UI events (modals, toasts) go through the typed event bus (`core/bus`), with modal ids/props compile-checked by `ModalPropsMap`.

## Conventions

- **No spec or backlog references in code** — never cite `API_CONTRACT §4`, `T3.6`, or a task id in a comment. Prefer self-explanatory code; comment only a non-obvious constraint or a deliberate workaround.
- **One top-level `describe` per spec file**, named after the unit under test; shared setup inside it.
- Tests land with the code they cover. Backend unit tests mock every external dependency; integration tests use the real disposable DB helper.
- **Branch per task, PR to `main`** — never commit or push directly to `main`.
- ESLint enforces explicit return types, `no-floating-promises`, and `no-console` repo-wide.

## Gotchas

- `design-packages/` and `.claude/` are **gitignored** (local only). `design-packages/TASK-001/` holds the specs and `IMPLEMENTATION_TASKS.md` backlog that drive this repo — read them for the "why" behind a design, but never reference them from source.
- Dependency pins are load-bearing: `vite` is pinned to `8.1.5`, `cookie-es` is an explicit dependency, and `@types/react` is duplicated at the root — npm bug #4828 otherwise breaks the build/lint on Linux CI.
- Adding a dep across parallel worktrees: install once at the repo root to populate `node_modules`, then per branch run `npm install --package-lock-only -w <workspace>`.
- Git worktrees go in a gitignored `worktrees/` directory at the repo root, not inside `.git`. Worktree `node_modules` symlinks are _not_ gitignored — add files explicitly rather than `git add .`.
- Vite deliberately pre-bundles only `@core/shared/error-codes` and `@core/shared/errors/error-response`; the bare barrel re-exports NestJS-backed code that breaks in the browser. Import the sub-paths on the frontend.
