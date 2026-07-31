# Task Management Platform

A generic, extensible task-workflow engine. Each task has a **type** (e.g.
`procurement`, `development`); a type declares an ordered list of **statuses**,
and each status declares the **fields** that must be supplied to advance into
it. The engine — status transitions, field validation, history, realtime
fan-out — is written once and knows nothing about any specific type. Adding a
new type is a data change, not an engine change (see
[Adding a third task type](#adding-a-third-task-type)).

- **Backend** — NestJS (`task-service`), PostgreSQL 15, Redis 7, TypeORM,
  Socket.IO.
- **Frontend** — React 19 + TypeScript + Vite (`task-app`).
- **Monorepo** — npm workspaces; shared error-code registry and base utilities
  in `backend-services/libs/core/shared` (imported directly by both sides — no
  mirror copy).

## Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10 (for manual dev mode).
- **Docker** + **Docker Compose v2** (for the containerised run).
- Ports free on the host: **3000** (backend), **5173** (frontend), **5432**
  (postgres), **6379** (redis).

## Quick start (Docker Compose)

```bash
npm run start      # generates .env if missing, then: docker compose up -d --build
npm run stop       # docker compose down
```

Compose brings up five services:

| Service    | Role                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `postgres` | PostgreSQL 15 database (`taskdb`), healthchecked.                                                          |
| `redis`    | Redis 7 — realtime fan-out across instances + rate-limiter storage.                                        |
| `migrate`  | One-shot job: runs the migrations, then exits. Backend waits for it to finish successfully before booting. |
| `backend`  | `task-service` API on **http://localhost:3000**.                                                           |
| `frontend` | `task-app` served on **http://localhost:5173**.                                                            |

Migrations run **only** in the `migrate` job — never on backend boot. The
schema is created and demo users are seeded before the API accepts traffic.

Once up:

- App — <http://localhost:5173>
- API base — <http://localhost:3000/api/v1>
- Health — <http://localhost:3000/health> and `/health/ready`
- OpenAPI docs (non-production) — <http://localhost:3000/docs>
- Prometheus metrics — <http://localhost:3000/metrics>

## Manual dev mode (hot reload)

Runs postgres + redis + the migrate job in Docker, then the backend and
frontend on the host with live reload:

```bash
npm run dev        # installs deps, builds the shared lib, starts db+redis+migrate, then api+web
```

Backend on `:3000` (Nest watch mode), frontend on `:5173` (Vite HMR). Stop the
containers afterwards with `npm run stop`.

> `npm run dev` already runs `npm install` — you do not need to run it
> separately.

### Verify (the green gate)

```bash
npm test           # full test suite across all workspaces
npm run lint       # eslint per workspace + prettier --check .
npm run build      # build all workspaces
```

## Seeded demo users

The `SeedUsers` migration inserts four users with fixed UUIDs, so every
environment (local, CI, staging) shares the same ids — API examples and client
fixtures stay valid everywhere. The idempotent seed is safe to re-run.

| Name  | Email            | Id                                     |
| ----- | ---------------- | -------------------------------------- |
| Alice | alice@demo.local | `10000000-0000-4000-8000-000000000001` |
| Bob   | bob@demo.local   | `10000000-0000-4000-8000-000000000002` |
| Carol | carol@demo.local | `10000000-0000-4000-8000-000000000003` |
| Dana  | dana@demo.local  | `10000000-0000-4000-8000-000000000004` |

## API summary

Base path: `/api/v1`. Errors use a uniform envelope
`{ errorCode, errorMessage, details? }` where `errorCode` is a numeric code from
the shared registry (HTTP status × 100 + serial, e.g. `40901`).

| Method & path             | Purpose                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /task-types`         | All task-type definitions (statuses + required fields, derived final status). Cacheable (ETag → 304).                                                                                    |
| `POST /tasks`             | Create a task (`type` + initial assignee); writes the task and its creation history row atomically.                                                                                      |
| `GET /tasks/:id`          | Fetch one task resource.                                                                                                                                                                 |
| `PATCH /tasks/:id/status` | Advance / reverse. Sends `direction`, `expectedStatus` (optimistic precondition — stale/duplicate submit → `409 TASK_STATE_CONFLICT`), `nextAssignedUserId`, and forward `customFields`. |
| `POST /tasks/:id/close`   | Close a task sitting at its final status (empty body).                                                                                                                                   |
| `GET /tasks/:id/history`  | Transition timeline, keyset-paginated oldest-first (audit trail).                                                                                                                        |
| `GET /users`              | List seeded users (drives the client user picker).                                                                                                                                       |
| `GET /users/:id/tasks`    | Tasks assigned to a user; `isClosed` filter + keyset cursor pagination.                                                                                                                  |

Pagination is **keyset (cursor)**, not OFFSET — it stays O(log n) at any table
size. Cursors are opaque to clients and validated on every request; a malformed
cursor returns `400 VALIDATION_ERROR`.

## Realtime events

Socket.IO namespace `/realtime`, fanned out across backend instances through the
Redis adapter. Clients join **rooms** and receive full-resource payloads:

| Room        | Receives                                                   |
| ----------- | ---------------------------------------------------------- |
| `task:{id}` | Updates to that specific task (detail view).               |
| `user:{id}` | Tasks entering/leaving that user's assignment (list view). |

Events: `task:created`, `task:updated`, `task:closed`. Each is emitted **only
after the database transaction commits**, so a client never sees an event for a
change that was rolled back. On reconnect the client rejoins its rooms and
reconciles. Payloads carry a fixed-length microsecond `updatedAt`; the client
uses it as a staleness guard so an out-of-order event never overwrites newer
state.

## Adding a third task type

The engine is type-agnostic, so a new type is added declaratively — **no engine
code changes**:

1. **Write the definition.** Add a class under
   `backend-services/task-service/src/task-type/definitions/` implementing
   `TaskTypeDefinition` — a `type` key, a `displayName`, and an ordered
   `statuses` array. Each status lists the `requiredFields` needed to advance
   into it (status 1 must have none). Field descriptors are typed: `string`
   (with `maxLength`, optional `pattern`) or `number` (optional `min`/`max`).

   ```typescript
   @Injectable()
   export class OnboardingDefinition implements TaskTypeDefinition {
     readonly type = 'onboarding';
     readonly displayName = 'Onboarding';
     readonly statuses = [
       { status: 1, name: 'requested', displayName: 'Requested', requiredFields: [] },
       {
         status: 2,
         name: 'provisioned',
         displayName: 'Provisioned',
         requiredFields: [
           { key: 'seatCount', label: 'Seats', fieldType: 'number', min: 1, max: 500 },
         ],
       },
       { status: 3, name: 'completed', displayName: 'Completed', requiredFields: [] },
     ] as const;
   }
   ```

2. **Register it** in `task-type/definitions/index.ts` by adding the class to
   the single `TASK_TYPE_DEFINITION_CLASSES` array. That array is the only
   registration point — the module spreads it into both the providers list and
   the aggregate injection, so a half-registered type is impossible.

That is the entire change. On startup the registry validates every definition
(no status gaps, no fields on status 1, no duplicate keys, non-empty display
strings) and fails fast if anything is malformed. The API immediately exposes
the new type at `GET /task-types`, and the frontend renders its statuses and
dynamic fields with no client changes — the final status is **derived** as the
last status in the list, never hand-declared.
