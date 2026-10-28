# ADR 0002 · Tenancy: `userId` on every owned row, one scoped data-access layer

- **Status:** Proposed (Phase 1)
- **Date:** 28/10/2026
- **Context sources:** `docs/BUILD-SPEC.md` §5.2, §5.3, §6 Phase 3 and §7; Phase 0 audit §2 and §4 (S3–S9,
  S11, S13–S18, S22, S24).

## Context

No table has an owner. Several natural keys are global: `ProfileField.key`, `Setting.key`, `Skill.name`,
`Language.name`, the `(source, externalId)` keys, `dedupeKey`, `GoogleAccount.id = "google"` and
`EmailMessage.gmailId`. Prisma is called directly from 445 sites in 60 files, so an ownership filter
sprinkled per call would be missed somewhere.

## Decision

### 1. One account = one tenant

There are no organisations (BUILD-SPEC §5.2). Every owned model gets
`userId String` + `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` + an index.
That includes child rows (`StatusEvent`, `Document`, `DocumentVersion`, `ChatMessage`, `Note`, `Fact`,
`ExperienceSkill`, `ProjectSkill`) even though they cascade from a parent. Putting the owner on children
means one uniform filter works for every query, and a child can never be attached to another user's parent
without failing a check.

### 2. Keys rewritten per user

| Model | Today | Becomes |
|---|---|---|
| `ProfileField` | `@id key` | `@@id([userId, key])` |
| `Setting` | `@id key` | `@@id([userId, key])`. Install-wide keys (usage-ping choice, update check) move to a new `InstallSetting` (`@id key`) that only the operator reads |
| `Skill`, `Language` | `name @unique` | `@@unique([userId, name])` |
| `Posting`, `Startup` | `@@unique([source, externalId])` | `@@unique([userId, source, externalId])` |
| `AgentCandidate` | `dedupeKey @unique`, `@@unique([source, externalId])` | `@@unique([userId, dedupeKey])`, `@@unique([userId, source, externalId])` |
| `PostingScore` | `@@id([source, externalId])` | `@@id([userId, source, externalId])` |
| `StartupBlock` | `@id hash` | `@@id([userId, hash])` |
| `GoogleAccount` | `id @default("google")` | `id @default(cuid())`, `userId @unique` |
| `EmailMessage` | `gmailId @unique` | `@@unique([userId, gmailId])` |
| `Theme` | none | `userId String?`: built-ins have `userId = null`, `builtIn = true`. Reads return built-in or own; writes are own only |
| `Job`, `ClaudePaste`, `PostingSearch` and the rest | none | `userId` required |
| `LoginThrottle` | per IP + global | unchanged model; the global bucket is not used in multi-user mode (ADR 0001) |

### 3. One data-access layer

- `src/lib/db/scoped.ts` exports `forUser(userId)`. It returns a Prisma client built with a **query
  extension** over `$allModels` / `$allOperations` that, for owned models:
  - adds `userId` to `where` on every read, update, delete and count;
  - sets `userId` in `data` on every create and upsert;
  - refuses `$queryRaw` / `$executeRaw`, where `model` is `undefined` (the docs' own caveat).

  Reference: https://www.prisma.io/docs/orm/v7/prisma-client/client-extensions/query
- **Not taken on trust.** The docs do not say whether nested writes pass through the query hook. So nested
  creates set `userId` explicitly, and the test matrix below is what proves isolation, not the extension.
  Phase 3 PR 1 also checks that Prisma 7 accepts the extra `userId` filter in `findUnique` / `update` /
  `delete` `where`, and pastes the result. The fallback is `findFirst` + `updateMany` / `deleteMany`, with
  the count checked.
- The raw `prisma` client is importable only from `src/lib/db/**`, the auth adapter and tests. An ESLint
  `no-restricted-imports` rule enforces this, so a new unscoped call fails lint.
- `action()` and `route()` pass `ctx.db = forUser(session.userId)`. Handlers stop importing `prisma`. The
  `userId` always comes from the server session, never from input (§5.3).
- A row owned by someone else looks exactly like a missing row: the same 404 or "not found" message.
- Background jobs get `forUser(job.userId)` from the runner (ADR 0005).
- PostgreSQL row-level security is **not** used in V1 (BUILD-SPEC §5.3 calls it optional). We may revisit
  after beta.

### 4. Migration of existing data (BUILD-SPEC Phase 3 task 9 and §7)

1. **Migration A.** Add `User` / auth tables and a **nullable** `userId` with its indexes. Do not drop the old
   unique keys yet.
2. **`scripts/claim-install.ts --email <address>`.** Run by the operator, once, explicitly. It assigns every
   unowned row to that user. It refuses if more than one user exists or if the user is not verified, and it
   is idempotent. Existing data never becomes visible to "the first public account" by accident (task 9).
   A fresh production database has no rows to claim.
3. **Migration B.** `userId` becomes NOT NULL, and the per-user keys replace the global ones. It fails
   loudly if any row is still unowned. Rehearse it on a copy of the backup first. Recovery is the pre-step
   backup (ADR 0003).
4. **Seed** (`prisma/seed.ts`). Built-in themes only. The demo profile is written only in dev or demo mode,
   into a dedicated demo user, never in production.

### 5. Export, import and delete

These become per-user operations:

- **Export** (`src/lib/data-export.ts:370`) runs on `ctx.db`.
- **Import** (`src/lib/data-import.ts:79`) replaces only the caller's rows.
- **"Delete everything"** (`src/app/(app)/settings/actions.ts:235`) becomes "delete my data" or "delete my
  account" (cascade from `User`), plus that user's files (ADR 0003).

## Cross-tenant test matrix (Phase 3 acceptance; "do not waive")

Users A and B each get a full fixture. For **every model** below, B's `forUser` client must read none of A's
rows, update and delete 0 of them, and a create that names A's parent id must fail. Anonymous calls are
refused.

| Aggregate | Models |
|---|---|
| Profile | `ProfileField`, `Skill`, `Language`, `Experience`, `ExperienceSkill`, `Project`, `ProjectSkill`, `Education`, `Publication`, `Reference`, `Fact` |
| Themes | `Theme` (own only; built-ins are readable, never writable) |
| Settings | `Setting` (including the encrypted AI, job-search and Google keys: never returned to B) |
| Applications | `Application`, `StatusEvent`, `Document`, `DocumentVersion`, `ChatMessage`, `Note` |
| Discovery | `Posting`, `ClaudePaste`, `AgentCandidate`, `PostingScore`, `PostingSearch`, `Startup`, `StartupBlock` |
| Google | `GoogleAccount`, `EmailMessage` |
| Ops | `Job` (status, SSE events, result), `UsageEvent` (ADR 0004), files and downloads (ADR 0003) |

The same matrix runs over **every route and action**:

- the 16 `route.ts` handlers: B gets 404 for A's `pdf/[id]`, `jobs/[id]`, `jobs/[id]/events`, `downloads/[id]`
  and Google callback state; `export` returns only B's data; `import` touches only B's data;
- every exported Server Action in the 20 `"use server"` files, called with A's ids;
- print pages, where a print token minted for A cannot render under B (ADR 0003).

A guard test lists every exported action and route and fails if one is not wrapped in `action()` / `route()`
or is not on the explicit public list. It adapts the coverage idea of upstream's security tests. There is at
least one Playwright scenario with two browsers. Same-key collisions are tested too: A and B both have a
skill named "Figma" and the same posting `(source, externalId)`.

## Consequences

Most Phase 3 diff is mechanical (`prisma.` → `ctx.db.`). Split it into PRs of at most about 400 changed
lines: schema + layer + matrix scaffolding first, then aggregate by aggregate, each turning its rows of the
matrix green.

## Files Phase 3 will touch

`prisma/schema.prisma` + two migrations, `prisma/seed.ts`, `prisma/seed/*`, new `src/lib/db/scoped.ts`,
`src/lib/prisma.ts`, `eslint.config.mjs`, `src/lib/action.ts`, `src/lib/route.ts`, new
`scripts/claim-install.ts`, and all 60 files with direct Prisma calls. The largest are
`src/app/(app)/profile/actions.ts`, `src/lib/profile-import-apply.ts`,
`src/app/(app)/applications/[id]/actions.ts`, `src/app/(app)/settings/actions.ts`,
`src/lib/startups/store.ts`, `src/lib/data-export.ts`, `src/lib/data-import.ts`, `src/lib/agent/*`,
`src/lib/google/*`, `src/lib/jobs/*`, `src/lib/settings-data.ts`, `src/lib/profile-data.ts`,
`src/lib/theme-data.ts` and `src/lib/postings.ts`. Plus all 16 `src/app/api/**/route.ts`, new
`src/test/tenancy/*.db.test.ts`, and a new `e2e/tenancy.spec.ts`.
