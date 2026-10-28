# ADR 0004 · AI cost caps: per-user daily quota, global daily cap, BYOK optional

- **Status:** Proposed (Phase 1)
- **Date:** 28/10/2026
- **Context sources:** `docs/BUILD-SPEC.md` §5.5 and §6 Phase 7; Phase 0 audit §5 and S10, S12.

## Context

There is one provider config for the whole install. Settings win over `DOSSIER_AI_*`
(`src/lib/ai/config.ts:54-89`). Every AI call runs inside a background job: `getAiProvider()` at
`src/lib/jobs/{read-posting:29, write-documents:36, refine:73, regenerate-unit:50, score-posting:34,
import-profile:26, write-email:50, draft-reply:60}`, `src/lib/agent/run.ts:132` and
`src/lib/google/sync.ts:170`. Nothing counts usage.

BUILD-SPEC §5.5 makes BYOK the default and puts a shared provider behind caps. CompCode's plan differs on
purpose: the **operator's shared provider is the default**, so a new user's first run works without a key,
and the cost is bounded by caps. BYOK stays optional for heavy users.

## Decision

- **Providers in multi-user mode:**
  - **Shared (default).** The operator's provider from `DOSSIER_AI_*`: Gemini through its OpenAI-compatible
    endpoint (`DOSSIER_AI_PROVIDER=openai`, base URL per https://ai.google.dev/gemini-api/docs/openai), or
    the operator's own model gateway behind the same OpenAI-compatible interface. Users never see or
    replace the shared key.
  - **BYOK (optional).** A user saves their own hosted provider and key in Settings. The key is encrypted as
    today (`src/lib/ai/api-key.ts:20-31`), but stored in that user's `Setting` rows (ADR 0002).
  - **Local providers** (`ollama`, `lmstudio`, `local`) are **hidden and refused** in multi-user mode. Their
    whole point is reaching the server's own network.
- **SSRF on BYOK base URLs.** Upstream's AI base URL has no private-address guard, by design, for local
  models (audit §5). A user-chosen URL would otherwise reach `career-db` or other containers on the VPS
  network. BYOK therefore accepts only:
  - (a) a fixed allowlist of hosted endpoints (Anthropic, Mistral, OpenAI, Gemini OpenAI-compatible); or
  - (b) any `https` URL that passes the same public-address DNS check posting fetches already use
    (`src/lib/posting-fetch.ts:73-91`), applied **at connect time**, including on redirects.

  Phase 3/7 picks (b) only if (a) proves too narrow.
- **What counts as an action.** Each AI **job start** is one action, for the types: `read-posting`,
  `write-documents`, `refine`, `regenerate-unit`, `score-posting`, `import-profile`, `write-email`,
  `draft-reply`, plus each agent scoring call and each inbox classification. Counting happens in one place,
  `startJob()` (`src/lib/jobs/runner.ts:113`), so a new job type cannot bypass it. Retries of the same job
  do not count twice: the idempotency key is the job id.
- **Per-user quota.** `CAREER_AI_USER_DAILY` defaults to **20** actions per user per day on the shared
  provider. "Day" is the server's `TZ` calendar day. BYOK users are exempt from this quota and from the
  global cap, but keep a per-user rate limit (`CAREER_AI_BYOK_DAILY`, default 200) against runaway loops.
- **Global cap.** `CAREER_AI_GLOBAL_DAILY` is the total shared-provider actions per day. When it is reached,
  shared AI is paused for everyone until the next day, with a plain message, and BYOK keeps working. The
  default is **200**, a placeholder for the beta that the operator sets before opening sign-up. A kill switch
  `CAREER_AI_SHARED=off` stops shared AI immediately.
- **Ledger.** A new `UsageEvent` table records `userId`, `jobId` (unique), `operation`, `provider`,
  `model`, `route` (`shared` or `byok`), `createdAt`, `outcome`, and token counts when the provider returns
  them. It never stores prompt or profile text (§5.5). The check-and-insert runs in one transaction with a
  `SELECT … FOR UPDATE` on a per-day counter row, so two parallel clicks cannot both take the last unit.
- **Failure mode.** Running out of quota is a normal job outcome with a user-facing message: "You've used
  today's 20 AI actions. They reset tomorrow, or add your own key in Settings." It is not an error and it
  is not a crash. The existing provider errors (missing key, timeout, malformed output) are unchanged.
- **Bounds that already exist** and are kept: timeouts (`DOSSIER_AI_TIMEOUT_SECONDS`), the redirect guard
  on keyed requests (`src/lib/ai/providers/guarded-fetch.ts`), the fact guard
  (`src/lib/ai/fact-guard.ts`), and review before apply.

## Consequences

The cost on the shared key is at most `CAREER_AI_GLOBAL_DAILY` × (the largest single-task token cost) per
day. Phase 7 adds the usage view in Settings, which shows actions left today.

## Files Phase 3 will touch

Phase 3 (data shape only):

- `prisma/schema.prisma` (`UsageEvent`, per-user `Setting`);
- `src/lib/ai/config.ts`, so `loadAiConfig(ctx)` resolves the user's BYOK, then shared;
- `src/lib/ai/index.ts`;
- `src/lib/jobs/runner.ts` (`startJob` quota check).

Phase 7 (the full quota UX):

- `src/lib/ai/provider-options.ts`, to hide local providers;
- `src/app/(app)/settings/actions.ts` and `src/app/(app)/settings/*`;
- new `src/lib/ai/quota.ts` (pure functions plus tests);
- `src/lib/posting-fetch.ts`, to export the public-address check for reuse;
- `src/lib/env.ts` (the `CAREER_AI_*` vars).
