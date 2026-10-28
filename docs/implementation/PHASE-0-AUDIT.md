# Phase 0 audit: the upstream code as forked

Covers `docs/BUILD-SPEC.md` §6 Phase 0. The audited tree is upstream `main` at
`5446f4cb117b0e4b4bbf26c6156c97406b0a4ff2` ("Dossier 1.9.2"), which is this fork's `main`. This PR changes
no code. File references are `path:line` at that commit.

**Summary.** Dossier is a well-tested **single-tenant** app. The session carries no identity at all
(`src/lib/auth/session.ts:27`). Every table is install-wide. Several tables use a natural key that only works
with one user: `ProfileField.key`, `Setting.key`, `Skill.name`, `GoogleAccount.id = "google"`, and others
listed in §4. Prisma is called directly from **445 call sites in 60 files** (§2), with no data-access layer.
That makes Phase 3 mainly a schema migration plus moving those calls behind one owner-scoped layer. Auth,
CSRF, the AI layer and the SSRF guard on posting fetches are solid, and Phase 3 should keep them.

## 1 · Architecture map

| Layer | Where | Notes |
|---|---|---|
| Framework | Next.js 16.3.6, React 19.3, App Router (`package.json`) | `src/proxy.ts` is Next 16's renamed middleware |
| App pages | `src/app/(app)/*` (12 `page.tsx`): dashboard, applications, new, profile, resume, jobs, agent, inbox, startups, settings | `src/app/(app)/layout.tsx:25` calls `verifySession()` once for the whole group |
| Print pages | `src/app/print/[doc]`, `src/app/print/base` | opened by headless Chromium with a print token (`src/lib/pdf/print-access.ts:15`) |
| Server Actions | 14 `"use server"` files under `src/app`, plus 6 in `src/lib` | all built with `action()` (`src/lib/action.ts:48`); session check at `:53` |
| Route handlers | 16 `route.ts` under `src/app/api` | private ones use `route()` (`src/lib/route.ts:49`): same-origin check `:57`, session `:60` |
| Domain logic | `src/lib/*` (profile, applications, documents, postings, job search, agent, google, connector, jobs, pdf, ai) | |
| Data | Prisma 7 + `@prisma/adapter-pg`, PostgreSQL 18 (`compose.production.yml`), schema `prisma/schema.prisma` (932 lines, 32 migrations) | client generated to `src/generated/prisma` |
| Background work | in-process timers started in `src/instrumentation.ts:3-50` | §7 |
| PDF | `playwright-core` Chromium in the app container (`src/lib/pdf/render.ts:91`) | 1 GB memory limit per upstream README |
| Claude connector | MCP server `src/app/api/mcp/route.ts` + OAuth 2.1 AS `src/lib/connector/oauth.ts` | stateless tokens bound to the password fingerprint (`oauth.ts:83-85`) |

Route handlers and how each is protected:

| Route | Guard |
|---|---|
| `api/pdf`, `api/pdf/[id]`, `api/import`, `api/profile/import`, `api/export`, `api/downloads/[id]`, `api/jobs/[id]`, `api/jobs/[id]/events`, `api/google/connect` | `route()`: origin + session, but no owner check (no owner exists) |
| `api/google/callback` | `getSession()` inline (`src/app/api/google/callback/route.ts:25`) |
| `api/mcp` | bearer token `verifyAccessToken` (`src/app/api/mcp/route.ts:32`) |
| `api/oauth/{metadata,protected-resource,register,token}` | public by design (connector OAuth) |
| `api/health` | public, excluded from the proxy matcher (`src/proxy.ts:74`) |

## 2 · Prisma data model

Grouped by owner aggregate. The "owner key today" column is what Phase 3 must change.

| Group | Models (schema line) | Owner key today |
|---|---|---|
| Profile | `ProfileField` (27, PK `key`), `Skill` (33, `name @unique`), `Language` (53, `name @unique`), `Experience` (63), `ExperienceSkill` (83), `Project` (94), `ProjectSkill` (113), `Education` (124), `Publication` (141), `Reference` (154), `Fact` (169) | none: one install, one profile |
| Themes | `Theme` (277; `builtIn` flag) | built-ins shared; custom ones none |
| Settings | `Setting` (340, PK `key`): AI provider + encrypted key, job-search keys, Google client, connector, backups, usage ping (`src/lib/settings.ts:109-231`) | none |
| Applications | `Application` (390), `StatusEvent` (464), `Document` (485), `DocumentVersion` (524), `ChatMessage` (543), `Note` (564) | none; children cascade from `Application` |
| Job discovery | `Posting` (588, `@@unique([source, externalId])` 617), `ClaudePaste` (625), `AgentCandidate` (641, `dedupeKey @unique` 672, `@@unique([source, externalId])` 676), `PostingScore` (684, `@@id([source, externalId])` 697), `PostingSearch` (702), `Startup` (734, `@@unique([source, externalId])` 781), `StartupBlock` (788, PK `hash`) | none, and the unique keys collide across users |
| Google | `GoogleAccount` (797, `id @default("google")`), `EmailMessage` (833, `gmailId @unique` 835) | one account per install |
| Ops | `LoginThrottle` (883, per IP + global `"*"`), `Job` (908) | `Job` has no owner; throttle is per IP, not per user |

Direct Prisma call sites outside tests: **445 in 60 files**. The largest are
`src/app/(app)/profile/actions.ts` (50), `src/lib/profile-import-apply.ts` (39),
`src/app/(app)/applications/[id]/actions.ts` (35), `src/app/(app)/settings/actions.ts` (22),
`src/lib/startups/store.ts` (19) and `src/lib/data-export.ts` (17). Counted with
`grep -rnoE "prisma\.[a-zA-Z]+\.[a-zA-Z]+|tx\.[a-zA-Z]+\.[a-zA-Z]+"` over `src`, excluding tests.

## 3 · Auth and session code path

1. `/login` posts the password to `src/app/login/actions.ts:35`, which calls `passwordMatches()`
   (`src/lib/auth/session.ts:100`). That verifies it against the argon2id hash in `DOSSIER_PASSWORD`
   (`src/lib/env.ts:31`, format `src/lib/auth/password-hash.ts:8`). Failures are throttled per IP and
   globally (`src/lib/auth/login-throttle.ts:11-26`).
2. `startSession()` (`session.ts:111`) sets cookie `dossier_session`: a JWE (A256GCM, key derived from
   `DOSSIER_SECRET`) holding `{persistent, pwd: <password fingerprint>}` and **no user id**. It is HttpOnly,
   SameSite=Lax, and Secure behind HTTPS (`:113-120`). It lasts 24 h, or 30 days with "keep me signed in"
   (`:24`).
3. On each request, `src/proxy.ts:25` decodes the cookie optimistically and redirects or returns 401. The
   real checks sit next to the data: `verifySession()` (`session.ts:134`) in layouts/pages, `action()`
   (`src/lib/action.ts:53`) and `route()` (`src/lib/route.ts:60`).
4. Sign-out deletes the cookie (`session.ts:141`). Changing the password signs everyone out, because the
   fingerprint is checked at `session.ts:88`.

Sessions are stateless, so there is no server-side revocation of a single session today.

## 4 · Every single-user assumption

| # | Assumption | Reference |
|---|---|---|
| S1 | One shared password, from the environment | `src/lib/env.ts:31`; `src/app/login/actions.ts:35`; `src/lib/auth/session.ts:100` |
| S2 | The session type has no user identity | `src/lib/auth/session.ts:27-32`, `:65` (token claims) |
| S3 | Guards check "signed in", never "owns this row" | `src/lib/action.ts:53`; `src/lib/route.ts:60`; `src/app/(app)/layout.tsx:25` |
| S4 | Profile basics keyed only by field name | `prisma/schema.prisma:28`; `src/lib/profile-data.ts:19` |
| S5 | Settings keyed only by setting name; loaded install-wide | `prisma/schema.prisma:341`; `src/lib/settings-data.ts:12` |
| S6 | Skill and language names unique install-wide | `prisma/schema.prisma:36`, `:56` |
| S7 | Postings, candidates, scores and startups deduplicated install-wide | `prisma/schema.prisma:617`, `:672`, `:676`, `:697`, `:781`, `:789` |
| S8 | One Google account per install | `prisma/schema.prisma:798`; `src/lib/google/account.ts:13` |
| S9 | Gmail message ids unique install-wide | `prisma/schema.prisma:835` |
| S10 | One AI provider and key for everyone (Settings, else `DOSSIER_AI_*`) | `src/lib/ai/config.ts:88-89`; `src/lib/ai/index.ts:37` |
| S11 | Jobs have no owner; any signed-in caller can read any job by id | `prisma/schema.prisma:908`; `src/lib/jobs/runner.ts:87`; `src/app/api/jobs/[id]/route.ts:8`; `src/app/api/jobs/[id]/events/route.ts:15` |
| S12 | One job queue with global concurrency, chosen by the single provider | `src/lib/jobs/runner.ts:70-71`, `:198` |
| S13 | PDF zip downloads in one shared folder, fetched by job id | `src/lib/jobs/zip-pdfs.ts:21`; `src/app/api/downloads/[id]/route.ts:16-20` |
| S14 | Export dumps every table | `src/lib/data-export.ts:370-380`; `src/app/api/export/route.ts:12` |
| S15 | Import replaces the whole database | `src/lib/data-import.ts:79`; `src/app/api/import/route.ts:17` |
| S16 | "Delete everything" wipes every row, backup and download | `src/app/(app)/settings/actions.ts:235`; `src/lib/backups.ts:42`; `src/lib/jobs/zip-pdfs.ts:57` |
| S17 | Nightly backup is one install-wide JSON export in one folder | `src/lib/backups.ts:15`, `:28`; `src/lib/backup-schedule.ts:40` |
| S18 | Print token binds a path, not a user | `src/lib/pdf/print-token.ts:18-19`, `:40` |
| S19 | Claude connector tokens bound to the shared password; one connector per install | `src/lib/connector/oauth.ts:83-85`; `src/lib/settings.ts:231` |
| S20 | Scheduled work runs once for "the" install (agent, inbox sync, startups, sweep, backups) | `src/lib/agent/schedule.ts:69`; `src/lib/google/sync.ts:200`; `src/lib/startups/schedule.ts:36`; `src/lib/jobs/retention.ts:36`; `src/lib/backup-schedule.ts:60` |
| S21 | Login throttle has a global bucket, so one attacker can slow sign-in for every user | `src/lib/auth/login-throttle.ts:11`, `:16` |
| S22 | `ClaudePaste` is readable by id alone | `prisma/schema.prisma:625` |
| S23 | Usage ping and update check answer for the install | `src/lib/usage-ping.ts:89`, `:116` |
| S24 | Seed and demo profile write into the shared tables | `prisma/seed.ts`; `prisma/seed/demo.ts`; `src/lib/demo-profile.ts:38` |
| S25 | Upstream documents the limit itself | `README.md:127` ("one password and one profile; there are no accounts"), `README.md:129` (one instance) |

## 5 · AI calls and where the key comes from

- **Provider resolution:** `loadAiConfig()` (`src/lib/ai/config.ts:88`). Settings win once a provider is
  saved there; otherwise `DOSSIER_AI_PROVIDER/URL/MODEL/KEY` apply (`:54-82`). The saved key is
  encrypted with a key derived from `DOSSIER_SECRET` (`src/lib/ai/api-key.ts:20-31`, `src/lib/secrets.ts`)
  and is never sent to the client (`config.ts:94`).
- **Providers:** `src/lib/ai/providers/`: anthropic, mistral, openai-compatible, ollama, lmstudio, local,
  and mock for tests. Hosted calls go through `guarded-fetch.ts`, which refuses a redirect to another
  host while the key is attached.
- **Tasks:** `src/lib/ai/tasks/`: extract-posting, extract-profile, match-requirements, tailor-resume,
  write-cover-letter, refine-chat, regenerate-unit, score-posting, classify-reply, draft-reply, write-email.
  The fact guard is in `src/lib/ai/fact-guard.ts`.
- **Call sites (`getAiProvider()`):** `src/lib/jobs/{read-posting:29, write-documents:36, refine:73,
  regenerate-unit:50, score-posting:34, import-profile:26, write-email:50, draft-reply:60}`,
  `src/lib/agent/run.ts:132` and `src/lib/google/sync.ts:170`. Each runs inside a background job, which
  gives one choke point for quotas (ADR 0004).
- **Gap for multi-user:** the AI base URL has **no private-address guard**. That is deliberate upstream,
  so that local Ollama works. Posting fetches do have one (`src/lib/posting-fetch.ts:73-91`). With
  per-user BYOK URLs, it becomes SSRF into the VPS network (ADR 0004).

## 6 · File storage

- **In the database:** the profile photo (a data URL in `ProfileField`, `src/lib/photo.ts:1-10`),
  document content and versions, and email text. PDFs are rendered on demand, not stored.
- **On disk under `DOSSIER_DATA_DIR` (`/data`):** `backups/` (`src/lib/backups.ts:15`) and `downloads/`
  (zips waiting to be downloaded, deleted after the one download, `src/app/api/downloads/[id]/route.ts:23`).
  There is no per-user path and no signed URL.

## 7 · Background jobs and the job agent

- **Job runner** (`src/lib/jobs/runner.ts`): rows in `Job`; an in-memory queue on `globalThis` (`:70-71`);
  concurrency depends on whether the provider is local or hosted (`:198`); progress through
  `subscribeJob` (`:165`) to the SSE route `api/jobs/[id]/events`. Startup recovery happens at
  `src/instrumentation.ts:11`. Job types: `src/lib/jobs/*.ts`, `src/lib/agent/{draft,jobs}.ts`,
  `src/lib/connector/draft.ts`, `src/lib/startups/refresh.ts`.
- **Timers** (`src/instrumentation.ts:13-31`): job sweep, nightly backup, inbox sync, job agent daily run
  (`src/lib/agent/schedule.ts:49`, `:69`), startups refresh. All are process-local, so upstream supports
  **one instance** only (`README.md:129`).
- **Job agent** (`src/lib/agent/run.ts:100`): searches the configured source, dedupes against
  `AgentCandidate.dedupeKey`, scores, and prepares drafts awaiting review.

## 8 · Google integrations

The OAuth client comes from `DOSSIER_GOOGLE_CLIENT_ID/SECRET`, or from Settings
(`src/lib/settings.ts:191-193`, secret encrypted). Connect and callback: `src/app/api/google/connect`,
`src/app/api/google/callback/route.ts:25`. The token is stored in `GoogleAccount` (id `"google"`),
refreshed by `src/lib/google/account.ts:85`. Gmail inbox sync is `src/lib/google/sync.ts` (classifies
replies with AI); sending is `send.ts`; Calendar is `calendar.ts`, `availability.ts` and `slots.ts`.
These are off in V1 by default.

## 9 · Test coverage and baseline

- **Unit/integration:** Vitest (`vitest.config.mts`), 209 test files in `src`, of which 54 are `*.db.test.ts`
  against a real Postgres. Ratcheted coverage thresholds: global 86/84/82/78
  (lines/statements/functions/branches), `src/lib/**` 94/92/90/83, `src/lib/ai/**` 94/92/92/81.
- **E2E:** Playwright, 25 specs in `e2e/`, with fake AI, Google and job servers (`e2e/fake-*.mts`) and an
  axe accessibility spec.
- **Baseline on this commit:** upstream's CI ran green on this fork for PR #1, whose app code is identical
  to this `main`: "Lint, type-check and test" and "End-to-end tests"
  (https://github.com/compcode-solutions/career-copilot/actions/runs/40738140137).
  **Not run in this session:** `yarn install` / lint / typecheck / vitest / playwright. Installing
  upstream's dependencies here was not attempted, because downloading external code is restricted in
  this session, and the CI job logs could not be fetched through the session proxy, so the counts are not
  pasted. Phase 3 PRs will paste the CI counts.
- **Gap:** there are no tests for ownership, because no owners exist. The cross-tenant matrix in ADR 0002
  is new work.

## 10 · Deployment assumptions (from upstream)

The app runs as a Docker image (`Dockerfile`, user `node`, `HEALTHCHECK` on `/api/health`) with Postgres 18.
Migrations run on start (`prisma migrate deploy` plus seed). It needs `DOSSIER_PASSWORD`, `DOSSIER_SECRET`
and `DATABASE_URL` (`src/lib/env.ts:31-58`), on a single instance. Our VPS deployment is `deploy/`
(PR #1).

## 11 · What this audit did not cover

UI, mobile and accessibility failure points (BUILD-SPEC Phase 0 task 7) belong to Phase 2. They are not
assessed here.
