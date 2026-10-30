# Phase 3 plan: multi-user identity and tenant isolation

Implements ADR 0001 (Better Auth) and ADR 0002 (tenancy) as a series of small PRs, each with one concern and
its own tests. BUILD-SPEC §6 Phase 3's gate applies to the series as a whole: every cross-tenant test passes and
production has no shared password. Nothing here changes how Phase A runs: single-password mode keeps working
until the cutover slice, and every new column is nullable until Migration B.

## Decisions taken while planning (where this plan refines the ADRs)

- **Migration A is split by aggregate.** ADR 0002 §4 describes one Migration A that adds a nullable `userId`
  everywhere. Here each slice adds the column for the models it covers, so every PR stays reviewable and its
  part of the matrix runs at once. Migration B (NOT NULL + per-user keys) is still one step, at the end.
- **The database refuses cross-owner parents.** ADR 0002 asks that "a create that names A's parent id must
  fail". Slice 1 enforces it with an owner-check trigger on every owned child table, not only in the scoped
  client, so it also holds inside transactions and nested writes (`connect`). Prisma does not manage
  triggers, so `migrate dev` leaves them alone.
- **Unowned rows are invisible.** Rows from the single-password era have `userId = NULL`, and the scoped
  client never returns them. `claimInstall()` gives them to the first account, on purpose, once.

## Slices

| # | Branch | Concern | Done when |
|---|---|---|---|
| 1 | `phase-3/01-identity-core` | Better Auth's tables (`User`, `Session`, `Account`, `Verification`); nullable `userId` on the applications aggregate (`Application`, `StatusEvent`, `Document`, `DocumentVersion`, `ChatMessage`, `Note`) and `Job`; owner-check triggers; the scoped client `scopeClient()` / `forUser()`; `claimInstall()`; the cross-tenant matrix harness | matrix green for those 7 models; guard test: every table with `userId` is in `OWNED_MODELS`; existing suite unchanged |
| 2a | `phase-3/02a-relation-scope` | Relations on the scoped client, from any model: owned list relations in `include` / `select` / `_count` get `where: { userId }` at any depth; a to-one owned relation is followed only from an owned model; `where` / `orderBy` / nested writes that reach owned rows from a model that isn't owned are refused (`relation-guard.ts`, map in `relations.ts`); the slice 1 review's "must land before slice 3" item | unit tests per rule; matrix rows for Theme→documents, User→applications/notes/_count and a Document→Theme→documents round trip; guard test that `relations.ts` matches schema.prisma; with the guard removed those matrix rows fail |
| 2 | `phase-3/02-owners-profile` | `userId` on the profile aggregate (`ProfileField`, `Skill`, `Language`, `Experience`, `ExperienceSkill`, `Project`, `ProjectSkill`, `Education`, `Publication`, `Reference`, `Fact`) and `Theme` (built-ins stay `userId = NULL`, readable by all, writable by none) | matrix green for them, incl. A and B both having a skill "Figma"; built-in theme read-only test |
| 3 | `phase-3/03-owners-rest` | `userId` on `Setting`, `Posting`, `ClaudePaste`, `AgentCandidate`, `PostingScore`, `PostingSearch`, `Startup`, `StartupBlock`, `GoogleAccount`, `EmailMessage`; new `InstallSetting` for install-wide keys | matrix green for every owned model in ADR 0002's table; encrypted settings never readable by B |
| 4 | `phase-3/04-better-auth` | `better-auth` dependency; `src/lib/auth/auth.ts` (Prisma adapter, Google, magic link via SMTP, invite allowlist hook, per-email send bucket); `src/app/api/auth/[...all]/route.ts`; `DOSSIER_AUTH_MODE=single-password\|accounts` in `src/lib/env.ts`; boot refuses `DOSSIER_PASSWORD` in production when the mode is `accounts`; `getSession()` returns `userId`; global throttle bucket off in `accounts` mode | sign-in spike result pasted (Next 16.3 + Better Auth); env tests for the flag and the boot guard; single-password e2e still green |
| 5a–5f | `phase-3/05x-scope-<aggregate>` | `action()` / `route()` pass `ctx.db` (`forUser(session.userId)` in `accounts` mode; the unscoped client only in `single-password` mode); call sites move from `prisma.` to `ctx.db.` aggregate by aggregate: applications, profile, settings, discovery + agent, Google, jobs runner + routes; then an ESLint `no-restricted-imports` rule allows the raw client only in `src/lib/db/**`, the auth adapter and tests | per aggregate: route/action rows of the matrix green (B gets 404 for A's ids); lint rule fails on a new direct import |
| 6 | `phase-3/06-migration-b` | `scripts/claim-install.ts --email` (thin CLI over `claimInstall()`); Migration B: `userId` NOT NULL, per-user keys from ADR 0002 §2, fails loudly on unowned rows; seed writes built-in themes only, demo data into a demo user outside production | migration rehearsed on a copy of a backup (runbook step); key-collision tests |
| 7 | `phase-3/07-cutover` | per-user export / import / "delete my data" / "delete my account"; per-user downloads and print tokens (ADR 0003); connector tokens carry `userId` + generation (connector stays off); guard test that every exported action and route is wrapped or on the public list; two-browser Playwright scenario; `docs/tasks/phase3-wiring.md` for the sign-in page and account menu (Grok) | full matrix over models, actions and routes green; no shared password in production config |

Each PR stays near 400 changed lines of logic; schema, generated-style SQL and tests come on top and are
counted separately in the PR description.

## How to run the tests here

`yarn test` runs the matrix with the rest of the `db` project (`src/test/tenancy/*.db.test.ts`). It needs
the Postgres from `compose.yml`, or `DATABASE_URL` pointing at any Postgres whose `<name>_test` database the
tests may wipe.
