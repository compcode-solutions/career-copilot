# Dossier Public Career Platform — Development Plan

**Status:** Implementation specification for an AI coding agent  
**Prepared:** 28 October 2026  
**Source project:** [AienTech/Dossier](https://github.com/AienTech/dossier)  
**Working product name:** `Career Copilot` (temporary; make branding configurable until final name/domain is selected)  
**Primary objective:** Turn the existing Dossier application into a polished, mobile-friendly, multi-user public career platform, launch a controlled free beta, and monetize eligible public career content with advertising—without compromising users' career data or creating uncontrolled AI/hosting costs.

> **Critical instruction:** Do not ask an AI coding agent to implement this entire document in one pass. Execute one phase at a time. Each phase must end with working code, tests, a reviewable diff, updated documentation, and an explicit go/no-go gate before the next phase starts.

---

## 1. Executive summary

Dossier is a feature-rich, open-source job-search app. It already supports a career profile, resume themes and PDF rendering, job discovery, job-posting analysis, match/gap analysis, tailored resumes and cover letters, iterative AI refinement, application tracking, and optional integrations/automation. Its upstream README identifies key limits: desktop-oriented UX, one user/profile per installation, and process-local queues/browser work.

The project therefore should **not** be rebuilt from scratch and should **not** receive only a cosmetic landing-page redesign. The right plan is to preserve its existing workflows and build a production-minded public product around them, with multi-user isolation and hosting validation treated as foundational work.

### Product outcome

A visitor can discover the product through useful career content, explore a demo, create an account, add/import their career profile, paste a job description, generate factual tailored documents, export them, and track an application—comfortably on desktop or mobile.

### Operating principle

- Keep core job-search tools free during beta.
- Use bring-your-own AI provider key (BYOK) as the initial default, or a local/mock provider for demos, to avoid an unbounded shared AI bill.
- Do not turn on shared paid AI usage unless per-user quotas, global budgets, abuse prevention and billing alerts are in place.
- Place ads only on eligible public editorial/content pages after publisher approval; do **not** put AdSense units inside the logged-in career software, resume editor, AI chat, private notes or other non-content/private-communication screens.
- Do not accept real user data until account isolation, backup/restore, secure document storage, deletion and privacy flows have passed release gates.
- Free hosting is an experiment, not a promise of perpetual production reliability. Run a hosting proof-of-concept before choosing a platform.

---

## 2. Repository findings and planning assumptions

The public upstream repository was reviewed on **28 October 2026**. The remote repository page reports a main branch and a package version of `1.9.2` in the inspected package metadata. Versions and file contents can change; the coding agent must record the actual commit SHA and inspect the cloned tree before implementation.

### Observed stack

- Next.js App Router (`next` listed as 16.3.6 in inspected package metadata)
- React / React DOM (19.3.0 in inspected package metadata)
- TypeScript
- Prisma ORM (7.x in inspected package metadata)
- PostgreSQL (development guide reports PostgreSQL 18)
- Yarn 4 (`packageManager` in package metadata)
- Tailwind CSS 4, Radix UI and Lucide icons are already dependencies
- Vitest and Testing Library for unit/component tests
- Playwright for end-to-end tests
- Server-side Chromium/Playwright-based PDF generation
- AI provider support includes OpenAI-compatible APIs, Anthropic, Mistral and local providers such as Ollama/LM Studio, according to project documentation

**Do not blindly upgrade or replace these packages during the redesign.** First get the existing application building and tests passing, then make isolated changes.

### Upstream capability to preserve

1. Career profile: personal basics, skills, languages, experience, projects, education and related career facts.
2. Resume creation: resume themes, customization/theme builder, live preview and PDF export.
3. Existing resume/profile import from supported formats.
4. Job search/source adapters and saved/dismissed opportunities where configured.
5. Job-posting extraction, fit/match explanation and missing-requirement/gap identification.
6. Tailored resumes and cover letters generated from profile facts.
7. AI refinement, versions/undo and private application notes.
8. Application status tracking from early stage through outcome.
9. Optional job-agent automation, Gmail and Google Calendar integrations, where already implemented.

**Preservation rule:** Do not remove a working upstream feature merely to simplify the redesign. If a feature cannot safely ship in a multi-user service yet, hide/disable it behind a documented feature flag and track it in a later phase. Do not expose a stub or fake-success interaction as a real feature.

### Known risks confirmed by upstream documentation

- Existing authentication is designed around a single shared password rather than public per-user accounts.
- Existing data structures and request logic are designed for one profile/one installation, not automatically isolated tenants.
- Some work (queues, job-agent scheduling, and browser-based PDF rendering) lives inside the app process; running multiple replicas can duplicate jobs or break assumptions.
- The original interface is documented as desktop-only.
- Hosted AI providers receive at least the data sent for generation; data-locality depends on which provider the user configures.

These are architecture changes, not just UI tasks.

---

## 3. Product scope

### 3.1 Primary audience

People actively searching for a job who need a reliable way to maintain their career history, tailor application documents, understand gaps against a job description, and manage multiple applications. Optimize first for English-speaking users globally, while keeping copy and date/number formats localizable later.

### 3.2 Core user journey

1. Visitor lands on the public homepage or a career guide.
2. Visitor understands the benefit, sees a demo, reviews privacy/AI explanations and clicks **Get started**.
3. User signs up, verifies email, and signs in.
4. Onboarding collects profile data or imports an existing resume.
5. User pastes a job description or selects a saved job.
6. System extracts role/company/requirements and shows matched evidence, gaps and uncertainty.
7. User creates a tailored resume and cover letter using only profile-supported facts.
8. User reviews and edits the output, downloads documents and creates/updates an application record.
9. User follows the pipeline on the dashboard and updates interview dates/status/notes.
10. User can export their data or delete their account at any time.

### 3.3 V1 public beta — must have

- Public marketing homepage and feature pages.
- Public demo with synthetic sample data and no private user information.
- Registration, email verification, sign-in/sign-out, password reset and account deletion.
- Multi-user-safe data model and authorization on every read/write operation.
- Responsive career profile and resume import flow.
- Existing resume theme/preview/PDF functionality retained and usable on mobile.
- Paste-job-description workflow; extracted job details; match/gap explanation.
- Tailored resume and cover letter generation and refinement, with review required before export.
- Job application tracker and dashboard, including a useful mobile layout.
- BYOK AI provider configuration stored securely and never returned to the browser after saving.
- Per-account usage limits and basic abuse controls.
- Privacy, Terms, AI/data processing explanation, contact/support and open-source/source-code attribution pages.
- Database backup/export and account data export/delete.
- Error handling, rate limiting, structured logs without sensitive payloads, smoke tests and an operational runbook.
- Public career-content section with a small set of genuinely useful original guides. Ads remain disabled until approval and policy review.

### 3.4 V1.1 / later phases — defer unless the repo proves they are already safe

- Job-source connections that require paid API keys or have provider terms to review.
- Daily job-agent scheduling and background tasks requiring durable queues/scheduler coordination.
- Gmail sending/reading, Google Calendar two-way sync and OAuth token management in a multi-user environment.
- Shared AI provider keys paid by the operator.
- Premium plans/payments, teams, referrals, advanced analytics and multilingual UI.
- Broad automated content generation for SEO.

Do not remove code for these capabilities during the initial refactor. Put them behind feature flags and re-enable only after the per-user ownership, OAuth, background execution, quotas and consent design is validated.

### 3.5 Explicit non-goals for V1

- Automatically apply to jobs or send an application without the user's explicit approval.
- Invent degrees, work history, skills, dates, accomplishments, certifications, or metrics.
- Promise that AI-written resumes will guarantee interviews or pass every ATS.
- Sell or use user resumes/job-search history as training data.
- Put display ads inside private workspaces or AI interactions.
- Launch with a single global password, demo admin credential, public test user, or shared production profile.
- Claim the service is permanently free or has enterprise-grade uptime before hosting is proven.

---

## 4. Brand, design and UX specification

### 4.1 Design direction

Build a premium, calm **career workspace**, not a generic AI chatbot. Use clear typographic hierarchy, generous whitespace, crisp document previews, meaningful data visualization and restrained motion. A light editorial surface with deep ink/navy text and a distinctive teal/emerald or cobalt accent is a good starting point; validate the palette for contrast before locking it.

The UI should feel valuable and trustworthy because users are handling career and identity details.

### 4.2 Design-system requirements

- Define design tokens for color, type scale, spacing, borders, radii, shadows, focus rings, z-index and motion.
- Reuse existing UI primitives where sound; avoid adding a new component framework without a documented reason.
- Establish consistent components: primary/secondary/tertiary buttons, icon button, inputs, text areas, selects, comboboxes, dialogs, menus, tabs, breadcrumbs, toasts, cards, table/list, chips, status badges, skeletons, empty states, error states and confirmation dialogs.
- All controls must have hover, focus, active, disabled, loading, success and error states as applicable.
- Use real product UI screenshots or authentic in-app demo data—not generic stock images—as the primary visual proof on the marketing site.
- Charts need accessible labels and a useful text equivalent.
- Animation must be subtle, serve a function and honor `prefers-reduced-motion`.
- Avoid heavy WebGL/3D effects in the resume editor and dashboard. Optimize for speed and document readability.
- Every button must work. If a feature is unavailable, explain why and disable it visibly rather than shipping a dead control.

### 4.3 Responsive breakpoints and acceptance sizes

At minimum, verify at 360×800, 390×844, 768×1024, 1280×800 and 1440×900. Test browser zoom to 200%.

- **Mobile:** one-column layout, compact navigation, bottom/side sheet for filters, forms with labels above fields, document editor with explicit switch between edit and preview, tracker as cards/list instead of a compressed desktop board.
- **Tablet:** responsive two-column profile/forms where space permits, usable document preview and tracker controls.
- **Desktop:** persistent side navigation, rich dashboard and split-screen editor/preview.
- No page-level horizontal scrolling except intentional, documented code/document/large data areas.
- Touch targets should be comfortably tappable; keyboard navigation and visible focus are mandatory.

### 4.4 Main product routes

Final paths may adapt to the existing router, but keep the information architecture coherent:

**Public:**
- `/` — product homepage
- `/features` — capability overview
- `/how-it-works` — walkthrough
- `/demo` — synthetic interactive demo; never use production user records
- `/career-guides` — editorial index
- `/career-guides/[slug]` — guide/article
- `/resume-examples` — resume resources/templates, with genuinely useful editorial text
- `/privacy`, `/terms`, `/ai-and-data`, `/open-source`, `/contact`
- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`

**Authenticated workspace:**
- `/app` — dashboard
- `/app/profile` — career profile and import
- `/app/resume` — base resume/themes
- `/app/new-application` — paste/import job post and begin tailored documents
- `/app/applications` — list/board of tracked applications
- `/app/applications/[id]` — job details, match, documents, versions, notes, activity/status history
- `/app/jobs` — job discovery (when enabled)
- `/app/settings/profile`, `/app/settings/ai`, `/app/settings/privacy`, `/app/settings/security`

Do not adopt these exact URLs blindly if it would cause unnecessary routing churn; the agent must map them to current paths and record any differences in an ADR.

### 4.5 Homepage content sections

1. Hero: clear promise, primary CTA, secondary **Explore demo** action, product screenshot.
2. Proof-by-workflow: Profile → Match → Tailor → Track.
3. Interactive demo using synthetic profile/job data.
4. Resume and cover-letter preview.
5. Transparent “AI will not invent your experience” section, with examples of evidence vs. gap.
6. Privacy and provider transparency: what is stored and what may be sent to a selected AI provider.
7. Job tracking/dashboard preview.
8. Frequently asked questions.
9. Editorial career resources.
10. Footer with terms, privacy, contact, source-code link, license and status/feedback channel.

---

## 5. Architecture and engineering principles

### 5.1 Keep the existing application as the foundation

- Use the current Next.js application and route system unless the audit demonstrates a concrete blocker.
- Keep public website/content and authenticated app in the same repository and initially the same Next.js deployment to avoid duplicating auth, components and operational burden.
- Use a clear separation between public routes and authenticated app routes.
- Keep AI provider integrations server-side. Do not move provider calls, secrets or sensitive prompt construction into the browser.
- Preserve and extend the current Prisma schema/migrations, validation schemas and service patterns rather than replacing the data layer.
- Keep PostgreSQL as the primary transactional store unless the repository audit uncovers a compelling incompatibility.
- Store uploads and generated files in a durable object-storage abstraction; never rely on an ephemeral local filesystem for production files.
- Keep the app portable in Docker for local development and deployment.

### 5.2 Multi-tenancy model

Adopt a simple single-account-per-user tenant model for V1. Avoid organizations/teams until they are a real requirement.

Minimum conceptual entities (map to existing schema before adding duplicates):

- `User`: id, email (normalized/unique), display name, password/auth provider linkage where supported, verification/disabled timestamps, created/updated timestamps.
- `UserSettings`: preferences, locale/time zone, AI provider preference, UI settings.
- Every user-owned aggregate must be linked to a user/owner: career profile, resume/theme customizations, job/application records, saved/dismissed jobs, notes, document versions, agent results, usage records, connections, uploads and exports.
- `AiProviderCredential`: encrypted credential, provider kind, key identifier/last-four metadata only where safe, timestamps. Never store clear-text keys.
- `UsageEvent`/`UsageWindow`: user ID, operation type, timestamp, model/provider metadata, token/cost estimates when available, outcome and idempotency key. Never store full prompt/profile text in normal usage logs.
- `OAuthConnection`: user ID, provider, encrypted refresh token/client secret as appropriate, scopes, expiry and revocation state.
- `FileObject` or equivalent metadata: owner ID, opaque storage key, content type, size, checksum, created/deleted timestamp.

Use the existing model names if sensible. These are requirements, not an instruction to duplicate entities.

### 5.3 Tenant isolation requirements

- Derive `userId` from a validated server-side session. Never trust a `userId` sent by the browser as authorization.
- Every data read and write for a user-owned resource must be scoped to the authenticated user.
- Authorization must happen at the server action/route-handler/service boundary, not only in page navigation or middleware.
- Resource IDs must not bypass ownership checks. A valid ID belonging to another user must behave as not found/forbidden without revealing its data.
- Any background job, file object, export, OAuth connection, AI request or scheduled task must carry an owner ID and check it before reading/writing.
- Add ownership indexes and foreign keys/cascade rules deliberately. Document retention/deletion behavior and avoid accidental orphan records.
- Consider PostgreSQL row-level security only as an additional layer, not a substitute for correct application authorization. If used, test the connection pool/session context carefully.
- Add negative cross-tenant tests for every major aggregate and at least one end-to-end scenario.

### 5.4 Authentication

Replace single shared-password production authentication with a mature per-user authentication approach compatible with the current Next.js/Prisma stack. Do not hand-roll password reset, verification or token cryptography.

Requirements:
- Signup, normalized email uniqueness, email verification, sign-in/sign-out, password reset, session expiry/revocation and account disable/delete.
- Secure, HttpOnly, SameSite cookies; `Secure` in HTTPS production; CSRF/origin protection appropriate to selected library.
- Password hashing via a modern maintained password-hashing implementation if passwords are managed locally.
- Rate limiting on signup, sign-in, password reset, verification resend and expensive AI routes.
- Avoid leaking whether an email address exists in reset flows.
- Optional social login may be added later; email/password is enough for the beta if secure email delivery is available.
- No production shared password or pre-created public account.
- Keep demo mode separate from production authentication and data.

The agent must compare maintained authentication options and record an ADR documenting the selected library/provider, reasons, account lifecycle, session strategy and migration plan. Do not start an auth refactor before documenting this choice.

### 5.5 AI architecture and cost safety

- Reuse existing provider adapters and prompt rules where possible.
- Make provider choice explicit: local provider, BYOK hosted provider, or a future operator-funded shared provider.
- Encrypt all saved API credentials at rest using a dedicated application secret/key-management approach. Do not reuse an encryption key for unrelated purposes where avoidable.
- Secrets must not be rendered to the client, included in analytics, returned from settings APIs, committed to source control or written to logs.
- Use Zod (or the repository's existing validation pattern) on user input and structured model outputs.
- Bound prompt/input size, request duration, output tokens and retry count. Add timeouts and cancellation where feasible.
- Record provider/model/usage metadata without saving sensitive prompt bodies in normal logs.
- Add per-user rate/usage quotas, global circuit breaker and operator-configurable spend limit before shared keys are enabled.
- Fail gracefully for missing key, invalid key, provider outage, quota exceeded, malformed model response or timeout.
- Make AI output review mandatory: the user must inspect/edit before applying or sending.
- Preserve the factuality invariant: generated content must only use facts supported by the profile or user-confirmed input; unproven requirements must be flagged as gaps/unknowns.

### 5.6 File/PDF architecture

- Use a storage interface (`put`, `get`, `delete`, signed access) rather than hardcoding a local path in business logic.
- All object keys should be opaque and non-guessable; storage access must enforce ownership.
- Validate file size, extension, MIME type and actual file signatures where supported. Limit PDF/DOCX import size and parsing time.
- Do not serve uploaded files from a public bucket by default. Use short-lived signed URLs or an authenticated server proxy.
- Generated resume PDFs must retain readable text, correct page breaks, links where appropriate and ATS-friendly structure.
- Keep PDF generation isolated from arbitrary untrusted remote URLs. Avoid passing user-controlled URLs to a browser in a way that enables SSRF.
- Make PDF rendering a separately measurable operation with queue/concurrency control.
- If the selected free host cannot run the existing Chromium renderer within reliable memory/time limits, record the measured blocker and propose a compatible fallback (server-based renderer on a supported runtime or client-print fallback) before weakening PDF quality.

### 5.7 Jobs, scheduler and integrations

- Keep job provider calls server-side, use allowlisted destinations/adapters and enforce timeouts/response-size limits.
- Preserve existing SSRF protections for job-posting URLs and metadata fetches. User-submitted URLs must not reach loopback, private IP ranges, link-local addresses, cloud metadata endpoints or arbitrary internal services.
- Never let posting HTML or LLM output become executable UI/script content.
- Every queued task needs an idempotency strategy, owner ID, retry policy and status.
- For initial beta, run one application instance unless all in-process scheduling, queues and PDF concurrency are made safe for multiple instances.
- Do not enable daily agent tasks until scheduling is durable, ownership-aware and resistant to duplicate execution.
- Gmail and Calendar must use per-user OAuth credentials, least scopes, encrypted tokens, verified OAuth state/redirect URI, clear consent and an immediate disconnect/revoke flow. One user's integration must never be shared with another.

---

## 6. Phased implementation plan

## Phase 0 — Repository audit, baseline and engineering contract

**Objective:** Understand the actual checked-out code and prove that the starting point is reproducible before changing it.

### Tasks

1. Fork the upstream repository into the owner's GitHub account/organization. Keep `upstream` pointing to AienTech and `origin` pointing to the owned fork.
2. Pin the exact upstream commit SHA in a development note and create a working branch, e.g. `work/public-platform`.
3. Inspect and summarize `README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `PRIVACY.md`, `LICENSE`, `package.json`, `.env.example`, Prisma schema/migrations, session helpers, server actions, route handlers, document parsing, PDF renderer, provider adapters, job-source fetching and all tests.
4. Run the documented Docker-based setup and existing commands: install/build, lint, typecheck, unit tests and Playwright E2E tests. Capture failures before touching source.
5. Produce a route map, data-model map, auth/request-flow map, background-task map and dependency map.
6. Inspect current authorization coverage. Identify every Server Action, Route Handler, file endpoint, background operation and provider connection that assumes a single user.
7. Inspect existing UI components, Tailwind styles, shared layout, accessibility and current mobile failure points.
8. Record the repo's actual current deployment assumptions, env variables, migration process and backup/restore behavior.
9. Produce `docs/architecture/ADR-0001-baseline.md` and `docs/implementation/PHASE-0-AUDIT.md`.

### Deliverables

- Reproducible local development instructions.
- Baseline test/build report with failures explicitly listed.
- Architecture/data-flow audit and feature inventory.
- List of all files likely to change for each following phase.
- Initial threat model and deployment constraints.

### Acceptance gate

- A new developer can start the app using documented instructions.
- Baseline commands have known results (passing or documented pre-existing failures).
- Agent has not done bulk refactors, dependency upgrades or UI rewrites.
- User-facing changes have not started until the auth and multi-tenancy approach is reviewed.

---

## Phase 1 — Product decisions, threat model and architecture decisions

**Objective:** Resolve high-risk design choices up front so implementation doesn't become a series of incompatible guesses.

### Tasks

1. Confirm a temporary brand token and product voice; keep the name/logo/domain easy to replace.
2. Finalize V1 scope using Section 3. Defer integrations that cannot be safely multi-tenant.
3. Write a data classification list: public content, account metadata, career profile, private application records, uploaded files, API credentials, OAuth tokens and usage/diagnostic data.
4. Define trust boundaries and threats: cross-tenant access, account takeover, file leaks, SSRF, prompt injection in job postings, API key leakage, abuse/cost attacks, malicious uploads, cross-site requests, OAuth misuse and backup exposure.
5. Create ADRs for authentication, multi-tenancy schema, storage, AI key/cost strategy, background jobs and initial hosting candidate.
6. Choose the smallest maintainable hosting candidate only after a proof-of-concept. Respect the platform's current terms for commercial/ad-supported projects.
7. Create an environment/configuration matrix: local, test/CI, preview/staging and production. Separate secrets and data across environments.

### Required decisions

- Authentication library/provider and email delivery.
- Data migration approach from the existing one-profile schema.
- Storage provider/interface for imports, exports and rendered files.
- Initial deployment runtime that supports the app's Node APIs and PDF generation, or a documented renderer adaptation.
- BYOK as default; shared provider disabled by default.
- Which optional features are hidden behind flags for V1.

### Acceptance gate

Every high-risk decision has an ADR, trade-offs and rollback/exit strategy. No choice should be based on “the AI agent thinks this is easiest” alone.

---

## Phase 2 — Design system and responsive application shell

**Objective:** Establish visual quality and responsive foundations without changing business logic unnecessarily.

### Tasks

1. Create design tokens and a component inventory in `docs/design-system.md`.
2. Refactor common navigation, page containers, page headings, action bars, notices, forms, cards, dialogs, toasts, loading skeletons and empty/error states.
3. Create public-site layout and authenticated workspace layout using route groups or equivalent existing routing conventions.
4. Implement desktop sidebar/navigation and mobile navigation/drawer.
5. Add responsive styles to existing major pages before building new features.
6. Implement a reusable responsive table/list pattern for applications and jobs.
7. Add accessible focus states, keyboard interactions, semantic headings, aria labels and reduced-motion support.
8. Add component tests for the shared primitives and visual smoke tests for main routes.
9. Create a synthetic demo fixture set and a demo mode that cannot access production data.

### Acceptance gate

- No broken existing workflows due to layout-only changes.
- All main existing screens render at 360px width without accidental page overflow.
- Keyboard navigation works for menus, dialogs and primary forms.
- No accessibility blocker in automated Playwright/axe checks for the core shell.
- Main interactive controls are real and have loading/error/success states.

---

## Phase 3 — Multi-user identity and tenant isolation (release blocker)

**Objective:** Make one public deployment safe for many independent users.

### Tasks

1. Implement the selected authentication flow: signup, verify email, sign-in/out, password reset, session lifecycle and account disable/delete.
2. Add `User`/account entities and migrations. Do not assume the existing single-user profile can simply be cloned.
3. Add owner/user references to every user-owned model and supporting indexes/foreign keys.
4. Refactor data access into explicit owner-scoped service/repository methods where helpful. Avoid unscoped `findUnique`/`update` calls on user-owned records unless ownership is checked in the same operation.
5. Add central authorization helpers that derive user identity from the server session.
6. Audit and update every Server Action, Route Handler, page loader, download/export route, background task and integration flow.
7. Replace shared single-password production mode. If retaining local single-user mode for developers, make it explicit and impossible to enable accidentally in public production.
8. Implement sign-in/reset throttling, anti-enumeration, safe redirects, session revocation and email-verification enforcement for sensitive capabilities.
9. Create a migration strategy for existing local data. Existing demo/profile data must not silently become visible to the first public account. Production should start with a clean owner-scoped data state unless an explicit, verified owner migration is run.
10. Add audit tests that enumerate protected actions/routes and fail on an unguarded endpoint, adapting upstream security tests where possible.

### Required cross-tenant test matrix

Create User A and User B. For profiles, applications, notes, document versions, imported files, exports, AI provider credentials, job results and integrations:

- A can create/read/update/delete A's own resources.
- B cannot read/update/delete A's resources by changing IDs, URLs, form payloads, API payloads or download URLs.
- Anonymous requests cannot access private resources.
- A task created for A cannot read or write B's data.
- Errors do not reveal the contents or existence of another user's resource.

### Acceptance gate — do not waive

- All cross-tenant tests pass.
- Every private data endpoint is authenticated and ownership-scoped.
- There is no shared production profile, password or public demo login with write access.
- Migrations are reversible or have a tested recovery approach and no user data loss in rehearsal.
- Security and privacy docs reflect the new multi-user model.

---

## Phase 4 — Profile onboarding, imports and user-owned files

**Objective:** Make first value easy and safely persist each user's career history.

### Tasks

1. Build an onboarding checklist with progress and clear skip/continue behavior.
2. Support manual profile entry and the existing supported resume import formats.
3. Show parsed data in a review/confirm step; never silently replace the user profile on import.
4. Validate dates, email/URL formats, field lengths and uploaded file size/type.
5. Preserve unknown/imported fields for review, and explain parser limitations.
6. Introduce storage adapter and private object storage for user uploads, exports and generated documents.
7. Add signed-download/authenticated-download handling with ownership checks.
8. Implement delete/re-upload semantics and cleanup for abandoned temporary uploads.
9. Keep demo profile data fully separate from real user profiles.

### Acceptance gate

- New user can finish onboarding without desktop-only interactions.
- Import failure does not destroy previously saved profile data.
- Uploaded file access is private and owner-scoped.
- File limits/timeouts and safe error states are tested.
- Profile writes persist across deploy/restart in the hosting candidate.

---

## Phase 5 — Resume studio and factual AI document workflow

**Objective:** Preserve Dossier's key differentiator and make the document workflow clear, fast and trustworthy.

### Tasks

1. Redesign the resume studio with an editable form/section navigator, live preview and explicit mobile edit/preview modes.
2. Preserve existing resume themes and the theme builder unless tests prove a theme is broken.
3. Improve generated PDF typography, margins, section headings, page-break behavior, long text handling and links.
4. Implement the job-description paste flow: paste → parse/confirm job details → inspect match/gaps → generate documents.
5. Show evidence behind match results: matched profile fact, requirement, gap/unknown and confidence/limitations.
6. Add a clear AI notice: model output is a draft and requires user review; users are responsible for accuracy.
7. Preserve existing iterative refinement, edit history and undo/revert semantics.
8. Validate model output before saving. Reject or repair malformed structured output safely; don't leak raw internal prompts or keys.
9. Track generation status and provide retry/cancel behavior. Avoid duplicate charges on double submit where idempotency is possible.
10. Keep PDF rendering and job analysis owner-scoped and bounded by concurrency/timeouts.

### Required factuality tests

- Model cannot add a degree/employer/skill/date/metric that is absent from the profile or user-approved input.
- Missing requirements appear as gaps/unknowns; they are not “fixed” by invention.
- User can inspect and edit all generated sections before export.
- A provider timeout or malformed response leaves existing documents intact.

### Acceptance gate

- End-to-end: profile → paste job description → match/gaps → tailored resume → cover letter → PDF export works on desktop and mobile.
- PDF generation passes text-extraction/layout smoke tests and does not expose another user's files.
- Existing history/undo behaviors survive refactoring.

---

## Phase 6 — Dashboard, application tracker and job workflow

**Objective:** Deliver a useful daily workspace around the existing job-management model.

### Tasks

1. Design dashboard cards for active applications, interviews/upcoming actions and recent activity using real account-scoped data.
2. Provide list and board views for application stages; on mobile, use cards/list as the default.
3. Support search/filter/sort by company, role, stage and relevant dates.
4. Preserve application details, status history, private notes and document versions.
5. Make status changes optimistic only when rollback/error behavior is safe; provide undo where supported.
6. Add deadline/interview reminders only after a reliable notification path has been chosen; don't ship fake reminders.
7. Re-enable job discovery only for sources with clear configuration, quota, timeout, allowed usage and data-retention behavior.
8. Show clear empty states with a useful next action rather than empty graphs or fake statistics.
9. Test concurrent edits and repeated status changes so pipeline metrics remain consistent.

### Acceptance gate

- All dashboard figures match underlying records and update after status changes.
- User A cannot see B's applications in cards, counts, filters, searches or direct URLs.
- The application tracker remains usable at 360px and by keyboard.

---

## Phase 7 — User settings, AI credentials, usage limits and safety controls

**Objective:** Make free use operationally safe and transparent.

### Tasks

1. Add AI provider setup with clear provider/model/base URL fields and validation.
2. Encrypt credentials server-side and reveal only masked/metadata information after save; never read back the stored secret to the UI.
3. Add a “test connection” operation with timeout, output filtering and rate limiting.
4. Add per-user quotas for AI actions, provider calls, expensive imports and job-search refreshes.
5. Add global kill switch and per-provider circuit breaker.
6. Add operator-configurable thresholds for daily total requests, error rates, token/output sizes and estimated spend.
7. Add user-facing usage state: remaining quota, reset time and understandable limit messages.
8. Add data export and “delete my account” workflows with re-authentication/confirmation. Delete or anonymize account-owned files, provider credentials and OAuth tokens according to the published retention policy.
9. Add privacy settings for optional analytics/notifications/integrations.
10. Document which user data is sent to which configured provider and why; include a first-use notice before any hosted provider request if needed.

### Acceptance gate

- No secrets in browser bundles, client payloads, logs, traces or analytics.
- Limits cannot be bypassed by calling an endpoint directly or parallelizing requests.
- Account deletion removes or schedules deletion of all account-owned content, files, credentials and connections, and records completion.
- A global provider outage or budget limit produces a graceful, non-destructive error.

---

## Phase 8 — Public website, content SEO and launch trust

**Objective:** Create a real acquisition channel without weakening the product experience.

### Tasks

1. Build homepage, feature pages, how-it-works, demo and legal/trust pages in the shared design system.
2. Add metadata, canonical URLs, Open Graph/Twitter cards, sitemap, robots policy, breadcrumb markup and appropriate structured data where valid.
3. Use server-rendered/indexable text for public content; do not hide the core article inside a client-only widget.
4. Create a small editorial starter set of original, human-reviewed resources, such as:
   - How to tailor a resume to a job description
   - How to describe measurable impact without exaggerating
   - Resume keywords: matching evidence, not keyword stuffing
   - Cover-letter structure and examples
   - Interview preparation checklist
   - Job-application tracking workflow
   - Resume examples by role/seniority, with meaningful commentary
5. Include author/reviewer identity, last-updated date, useful examples, sources where claims need support and clear editorial review. Do not mass-publish thin AI-generated pages or scrape/rewrite competitor articles.
6. Add privacy-friendly analytics with configurable consent and documented retention.
7. Test public pages separately from authenticated workspace so search crawlers never get private data or login-only content.
8. Add source link and AGPL licensing/attribution page as described in Section 8.

### Acceptance gate

- Public pages are indexable; private pages are authenticated and not emitted in sitemaps.
- No private application/profile data is ever used in structured data, metadata, logs or public demos.
- SEO pages have original utility and are not filler pages created only to host ads.
- Lighthouse/performance measurements are recorded for mobile public pages.

---

## Phase 9 — Advertising and revenue readiness

**Objective:** Add monetization only where it is appropriate, approved and measurable.

### Rules

- Do not put AdSense units in authenticated software screens, private notes, resume/cover-letter editors, AI chat, messages, account settings or non-content pages.
- Ads must be distinguishable from editorial content and may not be styled to trick users into clicking.
- Do not ask, reward or pressure users to click ads.
- Do not launch ads until the domain and site satisfy the current publisher approval and consent requirements.
- Keep the product functional when ads are blocked; ad scripts must not break the core app or materially delay the workspace.

### Tasks

1. Create an explicit `AdSlot`/ad-placement abstraction only for approved public editorial templates; return no markup until configured/approved.
2. Add a server-side allowlist of eligible public routes. Authenticated paths and software/tool routes must always be excluded.
3. Build a placement map with a restrained number of positions: e.g. within long-form editorial content after meaningful sections and possibly at the end of a guide. Do not place ads in the hero/near critical controls or use misleading proximity.
4. Implement consent handling based on target audience/regions and the chosen ad/analytics stack. Do not assume a banner alone automatically satisfies every applicable legal requirement.
5. Add CSP/security review for approved ad scripts without weakening security for the application. Document any required host allowlist changes.
6. Test with ad blocker, script failure, slow network and mobile viewport. Ads must not cause layout shifts that disrupt reading.
7. Maintain a manual policy-review checklist before enabling production ad IDs.
8. Track meaningful analytics such as public landing sessions and guide engagement, respecting consent and minimization.

### Acceptance gate

- No ad request occurs on private/application routes.
- All ad slots are empty/disabled by default in development, preview and unapproved production environments.
- No layout/interaction regression when ad scripts fail.
- A named owner and review date are recorded for publisher policy checks.

---

## Phase 10 — Hosting proof-of-concept, deployment and operations

**Objective:** Prove that the existing Node/Next.js/PDF architecture can run on the selected host and preserve data before inviting users.

### Deployment principle

The application needs server-side Next.js features, PostgreSQL, durable file storage and browser-based PDF rendering. Do not choose a host only because it advertises “free Next.js hosting.” Test the real production build, including PDF generation, in the intended runtime.

### Hosting constraints to account for

- Render's current free web services can spin down after 15 minutes idle and use an ephemeral filesystem; its free Postgres database expires after 30 days. Do not store uploads or the only copy of the production database there.
- Supabase Free currently provides a small Postgres database and may pause a project after a week of low activity. It can be useful for a pilot, but backups, capacity and pause behavior must be addressed.
- Vercel's current Hobby plan is for personal/non-commercial use. An ad-supported service intended for financial gain must not assume the Hobby plan is allowed.
- Cloudflare Workers has useful free limits, but the documented free CPU time per invocation is restrictive for typical server-side Chromium/PDF generation; full Next.js compatibility/adapter requirements must be validated instead of assumed.

Provider tiers and rules change. Recheck official terms and limits on the day of deployment.

### Hosting spike tasks

1. Containerize from the upstream Dockerfile/Compose approach; preserve a reproducible local path.
2. Identify app memory while idle, during concurrent PDF rendering and while generating a tailored application. The upstream README reports a minimum practical container size of at least 768 MB in its published benchmark; independently measure the checked-out version.
3. Test candidate deployment with production build, health check, migration, login, AI provider call, PDF render, file upload/download, restart and redeploy.
4. Verify database and object storage persistence across redeploy/restart and simulate a backup restore.
5. Verify email verification/password reset delivery, TLS/domain, logs, rate limiting and secret configuration.
6. Write a rollback deployment and data-migration procedure.
7. Keep the app at one instance initially unless queue/scheduler/PDF concurrency behavior has been made multi-instance safe.
8. Configure usage alerts or a documented manual budget review. Ensure there is no surprise paid-resource scaling.
9. Add basic health/readiness endpoints with no secrets and no private user data in responses.
10. Record actual build time, cold start, peak memory, PDF duration and any free-tier limitations in `docs/operations/hosting-spike.md`.

### Launch hosting decision

Choose one of:

- **Free controlled beta:** acceptable if the real workload passes all tests and the provider's terms allow the intended use; disclose sleep/pause limitations and protect data with independent backups.
- **Static public marketing + private/closed beta app:** use if no free runtime can safely handle the dynamic app/PDF workload.
- **Small paid service:** select if reliability, storage, memory or commercial terms make the free approach unsuitable. Do not promise $0 at the expense of user data safety.

### Acceptance gate

- Real production build works on the chosen host.
- Application state survives redeploy/restart.
- Backup/restore is demonstrated, not merely configured.
- PDF generation passes at expected concurrency and memory limits.
- Provider terms allow the use case.
- No real users invited until operational/security checklist is signed off.

---

## Phase 11 — QA, security review and controlled beta

**Objective:** Establish confidence that the application is safe and useful enough for the first public users.

### Test layers

**Unit tests**
- Validation schemas, prompt/output validation, application status rules, quota math, file-type checks, ownership helpers, provider error mapping, data-export logic and deletion logic.

**Integration tests**
- Prisma migrations on clean database and upgrade path.
- Authentication lifecycle.
- Every major service under User A/User B isolation.
- Storage authorization/signed URL expiry.
- Provider calls with mocks, including rate limit, timeout, malformed output and server error.
- DB transaction/rollback behavior around document generation and status updates.

**End-to-end tests**
1. Signup → verify → create profile → paste job → generate docs → PDF download → track application.
2. Return user → update profile → refine document → undo → status update.
3. Mobile viewport full core flow.
4. Password reset and account deletion.
5. User B attempts direct access to User A's records/files.
6. AI provider missing/slow/unavailable.
7. Job URL attempts to reach private network ranges (must be blocked).
8. Ads disabled on all private/tool routes and content pages remain readable if ads fail.

**Operational tests**
- DB backup and restore.
- App restart/redeploy.
- Provider rate/quota circuit breaker.
- Storage outage and email delivery failure.
- Application logs exclude secrets, full resumes, prompt bodies and OAuth tokens.

### Beta rollout

1. Internal/test accounts only using synthetic or owner-approved data.
2. Small invite-only user group with clear beta notice and support path.
3. Review error rates, actual model costs/quotas, PDF memory, signup drop-offs and mobile issues.
4. Fix high-impact problems before enabling public signup.
5. Enable public sign-up only after the launch checklist below is complete.

### Release checklist

- [ ] Clean production migration and rollback plan tested.
- [ ] Authentication and cross-user isolation test suite passes.
- [ ] Privacy policy and terms reviewed for the actual data flows.
- [ ] AI-provider disclosure/consent is clear.
- [ ] Account export and delete workflows tested.
- [ ] Private storage and download authorization tested.
- [ ] Backup restore completed within an acceptable recovery point/time.
- [ ] Error reporting/log retention and contact/support process set.
- [ ] Provider quotas and abuse safeguards enabled.
- [ ] Ads disabled until publisher approval and route allowlist verification.
- [ ] AGPL/source link and attribution visible.
- [ ] Accessibility, mobile and performance checks recorded.
- [ ] Hosting terms and limits rechecked on release day.
- [ ] Known limitations/beta status disclosed to users.

---

## Phase 12 — Post-beta improvements (prioritize from evidence)

Do not schedule these merely because they are listed. Prioritize from user feedback, metrics and actual support burden.

Potential extensions:
- Re-enable job-agent automation using durable scheduling/queues and per-user idempotency.
- Add Gmail/Calendar integrations after OAuth/token ownership checks and privacy controls.
- Add multi-provider job search with per-source quotas and transparent attribution.
- Add opt-in email reminders and interview preparation workflows.
- Add better resume templates, localization, language support and import diagnostics.
- Add paid premium tier only after operational cost is understood and AGPL obligations are satisfied.
- Add richer content, template libraries and legitimate affiliate relationships.
- Add observability dashboards, incident playbooks and dependency vulnerability scanning.

---

## 7. Database migration and release-safety rules

This section is mandatory because the upstream project was designed for a single user.

1. **Never** deploy a schema change that makes existing unowned records visible to every new user.
2. Every migration must have a written purpose, tested SQL outcome and recovery plan.
3. For existing local/demo databases, provide an explicit local-only migration/ownership assignment tool if useful; never auto-assign existing production data to a random first registrant.
4. For a fresh public service, prefer an empty production database with all tables owner-scoped.
5. Use a separate staging database with synthetic data.
6. Back up before any production migration and perform a restore rehearsal before first public launch.
7. Avoid destructive migrations until all code paths have moved to the new model and old data handling has been validated.
8. Migrations must be safe to run once and must fail clearly if prerequisites are missing.
9. Keep a migration ledger in `docs/architecture/` and update schema diagrams after each material change.
10. Write tests for data retention/cascade behavior. Do not let user deletion silently leave publicly accessible files or secrets.

---

## 8. License and attribution compliance

The upstream project is licensed under **GNU AGPL v3.0**. Under AGPLv3 Section 13, if a modified version is made available for users to interact with over a network, the modified version must prominently offer those users access to its Corresponding Source at no charge through a standard way to copy it.

Implementation requirements:

- Preserve the upstream license and copyright/attribution notices.
- Retain third-party notices and honor the licenses of all added assets/dependencies.
- Maintain a public source repository for the hosted modified version and a prominent link to it in the public site/app footer or About/Open Source page.
- Ensure the linked source corresponds to the version actually deployed; tag releases and identify the commit/build.
- Publish source code for modifications covered by AGPL and provide it to network users as required by the license.
- Do not add a “no redistribution” restriction or other term that conflicts with the AGPL.
- Do not remove upstream attribution to make the software appear originally authored from scratch.
- Review the implications before introducing proprietary modules or accepting contributions under incompatible terms. Seek legal advice for a novel licensing/distribution model.

This plan is engineering guidance, not legal advice.

---

## 9. Ads, editorial quality and privacy

### Advertising policy boundary

Treat the career application as software and the signed-in workspace as private work content. AdSense policy currently prohibits its ad code from being integrated into software applications and prohibits placements on email/private-communication screens and non-content pages. Therefore:

- **Allowed target area:** eligible public editorial guides/resources with original, substantive content, subject to approval and all current policy requirements.
- **Excluded area:** all authenticated workspace routes, profile/resume editing, cover-letter output, AI chats, notes, account/security settings, private application detail pages, login/signup/reset forms, demo screens that are primarily software, and any non-content pages.
- Never inject ads into a PDF or downloaded resume/cover letter.
- No “click ads to support us” messaging, forced views, pop-ups/pop-unders or deceptive placement.

### Content principles

- Each article should solve a real career-search problem and include examples, useful steps and editorial review.
- Use primary sources when making claims about employers, certifications, hiring processes or regulations.
- Do not republish scraped articles, scrape job boards against terms, or mass-produce near-duplicate pages.
- Provide a clear editorial contact/correction path and update old content where it becomes stale.
- Keep ads visually distinct and limit clutter so the resource remains useful without ad scripts.

### Privacy principles

- Collect only necessary personal information.
- Explain where hosted AI providers, job sources and optional Google integrations receive data.
- Separate necessary service logging from optional analytics.
- Do not log profile/resume contents, complete prompts, API credentials or OAuth tokens.
- Make data export and deletion usable without support intervention where possible.
- Define backup retention and communicate that deletion from active systems and deletion from backup rotation may occur on different schedules.
- Review current privacy, cookie/consent and data-protection obligations for target markets before launch.

---

## 10. Recommended repository structure for new project documentation

Adapt paths to the existing project, but keep specs close to code:

```text
docs/
  architecture/
    ADR-0001-baseline.md
    ADR-0002-authentication.md
    ADR-0003-multi-tenancy.md
    ADR-0004-file-storage.md
    ADR-0005-ai-cost-controls.md
    ADR-0006-hosting.md
    data-model.md
    threat-model.md
  design/
    design-system.md
    route-map.md
    responsive-ux-checklist.md
  implementation/
    PHASE-0-AUDIT.md
    phase-status.md
    test-matrix.md
  operations/
    deployment.md
    backup-restore.md
    incident-response.md
    hosting-spike.md
    launch-checklist.md
```

Update `phase-status.md` at the end of every phase with: status, PR/commit, scope delivered, tests run/results, known risks, migrations, follow-up tasks and gate decision.

---

## 11. AI coding-agent operating protocol

Use this protocol in Cursor, Claude Code, Copilot coding agent or another repository-aware agent.

### Non-negotiable rules

1. Read this plan and the repository's `AGENTS.md`/contributor instructions before editing.
2. Work on a dedicated feature branch. Never push directly to the production/default branch.
3. Work on exactly one phase or clearly bounded sub-phase at a time.
4. Before editing, inspect the relevant existing code and produce a short implementation plan listing files and tests expected to change.
5. Make the smallest change that meets the phase specification. Do not opportunistically upgrade dependencies or refactor unrelated files.
6. Reuse existing patterns/components where reasonable. Do not create competing abstractions for the same concept.
7. Never fabricate successful command output. Run commands and report actual outcomes. If a command cannot run, say why.
8. Never commit secrets, production data, private resumes, API keys, OAuth tokens, real user records or `.env` values.
9. Never disable a security check or weaken TypeScript/tests to make a build pass without documenting and justifying a deliberate decision.
10. Do not implement authentication/tenancy changes using mock checks or client-only guards.
11. Add/modify tests with each behavior change. Cross-tenant negative tests are mandatory for protected data work.
12. After editing, run the relevant tests first, then lint, typecheck, unit suite, E2E suite where applicable and production build.
13. Inspect the final diff for unrelated changes, dead controls, secrets, migration hazards and missing documentation.
14. End with a concise report: files changed, behavior delivered, tests run/results, migration/env changes, known gaps and whether the phase gate passes.
15. Stop after the phase is complete. Do not silently continue to the next phase.

### Standard agent task prompt

Copy this prompt and replace the phase number/scope every time:

```text
You are a senior engineer working in the existing AienTech/Dossier codebase.

Read DOSSIER_PUBLIC_PLATFORM_DEVELOPMENT_PLAN.md, AGENTS.md (if present), README.md,
DEVELOPMENT.md, SECURITY.md, PRIVACY.md and the relevant code before you edit anything.

Implement Phase [N]: [PHASE NAME] only.

Rules:
- Preserve existing Dossier functionality unless the phase explicitly changes it.
- Do not rewrite the application from scratch or upgrade unrelated dependencies.
- Do not begin the next phase.
- Before editing, report a short plan with likely files, migration implications and tests.
- Follow the current codebase patterns and add tests for every behavior change.
- Treat all career data, generated documents, API credentials and OAuth tokens as sensitive.
- Never trust a client-provided userId; derive identity from the validated server session.
- Never weaken auth, tenant isolation, SSRF protections, file authorization, CSP or tests to get a green build.
- Do not insert ads on private or authenticated software pages.
- Respect the AGPL-3.0 license and retain a public source/attribution path.
- Run and report actual command output for relevant tests, lint, typecheck, E2E and build.
- Do not claim a test passed unless you ran it successfully.
- Review the final diff for scope creep, secrets, unrelated changes and incomplete loading/error states.

Deliverables for this phase:
1. Working implementation within scope.
2. Tests added/updated and actual test results.
3. Documentation/ADR updates where needed.
4. A final report with changed files, decisions, migrations/env vars, remaining risks and gate status.

If the specification conflicts with existing code, stop before making a risky assumption. Explain the conflict and propose the smallest safe resolution; do not silently redesign the architecture.
```

### Suggested implementation cadence

- Phase 0: one audit PR.
- Phase 1: ADR/spec PR.
- Phase 2: UI foundation PR, then route-by-route visual PRs.
- Phase 3: identity/migration PRs divided by bounded model groups, with cross-tenant tests in each PR.
- Phases 4–7: vertical slices: database/service → server action/route → UI → tests → docs.
- Phases 8–9: public-site/content/ad-slot work separated from private app work.
- Phases 10–11: deployment and release hardening PRs.

Prefer several small PRs over a single broad PR. Do not merge Phase 3 until its security gate passes.

---

## 12. Definition of done for every feature

A feature is not done when its UI looks complete. It is done only when all applicable criteria below pass:

- [ ] Behavior meets the requirement and existing workflows still work.
- [ ] Data is validated on the server and persisted correctly.
- [ ] Authentication and ownership are enforced server-side.
- [ ] Loading, empty, success, validation-error and server-error states exist.
- [ ] Keyboard and screen-reader semantics are reasonable; focus is visible.
- [ ] Mobile layout has been tested at 360px and 390px widths.
- [ ] No private data appears in URLs, browser logs, analytics or application logs unnecessarily.
- [ ] Expensive operations have limits/timeouts and graceful failure behavior.
- [ ] Tests cover normal behavior and the most important negative/security case.
- [ ] Documentation, environment examples and phase-status file are updated.
- [ ] Actual test commands/results are recorded.

---

## 13. Launch metrics and success criteria

Track only what is useful and privacy-appropriate. Suggested beta metrics:

- Signup completion and email verification success rate.
- Percentage of new users who finish profile setup.
- Percentage who complete the first job-to-document workflow.
- PDF generation success/failure and duration.
- AI provider failures, rate-limit hits and per-user usage.
- App response time and memory/CPU on the chosen host.
- Cross-tenant/security regression test status.
- User-reported factual errors in generated documents.
- Mobile completion rate and high-priority UX issues.
- Public guide traffic and engagement, only under the chosen analytics/consent rules.
- Ads: approval status and eligible-page behavior only after ads are enabled.

Do not optimize for raw registrations or page views at the expense of user trust, private data, or AI cost controls.

---

## 14. Open questions the agent must not guess

These decisions can be resolved by the project owner after Phase 0/1 evidence is available:

1. Final brand, domain and logo.
2. Whether signup is open to everyone at launch or invite-only for beta.
3. Whether BYOK is acceptable for first users or whether to fund a small shared AI quota.
4. Which AI providers are allowed at launch and which user data may be sent to them.
5. Whether Gmail/Calendar integrations are part of V1 or remain disabled until a later phase.
6. Target audience/regions and required privacy/consent review.
7. Hosting candidate and maximum acceptable monthly spend after beta.
8. Which original feature gaps are acceptable in the first beta; document them honestly.

If unresolved by the start of implementation, use these safe defaults: temporary product name, invite-only beta, BYOK, no shared AI spend, integrations disabled until tenant isolation is confirmed, editorial-only ads after approval, and a tested backup before any real user data is accepted.

---

## 15. Source references

These references informed this plan. Re-check current docs and the checked-out repository at implementation/deployment time because upstream code and platform limits change.

1. [Dossier upstream repository and README](https://github.com/AienTech/dossier) — features, known limitations, tech stack and license statement.
2. [Dossier `package.json`](https://github.com/AienTech/dossier/blob/main/package.json) — package manager, framework versions and test commands.
3. [Dossier development guide](https://github.com/AienTech/dossier/blob/main/DEVELOPMENT.md) — Docker/Yarn/Prisma workflow and current local development assumptions.
4. [Dossier security policy](https://github.com/AienTech/dossier/blob/main/SECURITY.md) — upstream session, key storage, route protection and fetch safety mechanisms.
5. [Dossier privacy documentation](https://github.com/AienTech/dossier/blob/main/PRIVACY.md) — data held by the app and data shared with external providers.
6. [GNU AGPL v3.0, especially Section 13](https://www.gnu.org/licenses/agpl-3.0.html) — source-code offer for modified network-accessible versions.
7. [Google AdSense Program Policies](https://support.google.com/adsense/answer/48182) — ad placement and software/private communication restrictions.
8. [Render free deployment documentation](https://render.com/docs/free) — free service behavior, spin-down, ephemeral filesystem and database expiry constraints.
9. [Supabase free-project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) and [pricing](https://supabase.com/pricing) — free-tier inactivity and storage constraints.
10. [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) and [Terms of Service](https://vercel.com/legal/terms) — commercial-use limitation for Hobby.
11. [Cloudflare Workers pricing/limits](https://developers.cloudflare.com/workers/platform/pricing/) and [Next.js deployment guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/) — alternative runtime limits and compatibility path.

---

## Final recommendation

Start with **Phase 0 only**. Get the existing Dossier repository running, collect the baseline, and map all the single-user assumptions. Then make the auth/tenant/storage/hosting decisions in Phase 1. Build the new design on top of the existing working product, and do not open public registration until the cross-tenant security and data-recovery gates are met.
