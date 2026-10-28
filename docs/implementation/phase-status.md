# Phase status — Career Copilot (spec 124)

A new session resumes from this file. Spec: CompCode's internal spec 124 (Amendment 1 governs owners and Phase A; kept in the
private hub, not here). Engineering reference: `docs/BUILD-SPEC.md`.

## Fork

| | |
|---|---|
| Upstream | https://github.com/AienTech/dossier (AGPL-3.0) |
| Forked | 28/10/2026 by Grok (G-02) into `compcode-solutions/career-copilot` (public) |
| Upstream `main` at fork | `5446f4cb117b0e4b4bbf26c6156c97406b0a4ff2` |
| Newest upstream tag at fork | `v1.9.2` (= upstream `main` HEAD, commit "Dossier 1.9.2"; the runbook still checks the image tag exists before use) |

## Phase A — upstream image, single user, on the VPS

| | |
|---|---|
| Status | **PR open** (this file's PR): deploy files + runbook. Next: review → merge → first deploy per `deploy/README.md` → owner signs in |
| Image | `ghcr.io/aientech/dossier:v1.9.2`, overridable with `DOSSIER_IMAGE_TAG` |
| URL | https://career.compcodesolutions.com (Traefik on `coolify`, Let's Encrypt; no published ports) |
| Auth | upstream's single password: `DOSSIER_PASSWORD` = argon2id hash from `hash-password` (reads stdin when piped) |
| Data | Postgres 18 in volume `career_pg`; backups/exports in `/opt/backups/career` (host) = `/data` (container) |
| Gate | The owner signs in and exports one tailored resume PDF |

### Environment (names only)

| Variable | Needed | Where it comes from |
|---|---|---|
| `POSTGRES_PASSWORD` | required | `openssl rand -hex 24` on the VPS |
| `DOSSIER_SECRET` | required | `openssl rand -base64 32` on the VPS |
| `DOSSIER_PASSWORD` | required | `hash-password` of a random login password; the plain password goes only to the owner's private secrets file |
| `DOSSIER_IMAGE_TAG` | optional | defaults to `v1.9.2` |
| `TZ` | optional | `Asia/Kolkata` (backups at 03:00 IST) |
| `DOSSIER_BACKUP_RETENTION_DAYS` | optional | 7 |
| `DOSSIER_TELEMETRY` | optional | `off` |
| `DOSSIER_PUBLIC_URL` | optional | `https://career.compcodesolutions.com` |
| `DOSSIER_AI_PROVIDER`, `_URL`, `_MODEL`, `_KEY`, `_TIMEOUT_SECONDS` | optional | Gemini via `openai` provider + `https://generativelanguage.googleapis.com/v1beta/openai`; key from the existing VPS env. Values saved in Settings → AI provider override these |
| `DOSSIER_JOBS_*`, `DOSSIER_JSEARCH_*`, `DOSSIER_ADZUNA_*` | optional, off | job search; not in Phase A |
| `DOSSIER_GOOGLE_CLIENT_ID`, `_SECRET` | optional, off | Gmail/Calendar; spec 124 §4 default off in V1 |

### AI provider

Configured by env defaults or in the app (Settings → AI provider; saved values win, keys stored encrypted with
`DOSSIER_SECRET`, per upstream `.env.example`). Providers: local, openai (any OpenAI-compatible), anthropic,
mistral, lmstudio. The openai provider posts to `<URL>/chat/completions` (upstream `src/lib/ai/providers.test.ts`).

### Tests run for Phase A

| Check | Result |
|---|---|
| `docker compose -f deploy/compose.prod.yml --env-file deploy/career.env.example config -q` | passed |
| No published ports; image not `latest` (the CI checks) | passed, and both checks catch a deliberately broken copy |
| `actionlint .github/workflows/deploy-vps.yml` | passed |
| Upstream lint / typecheck / unit / Playwright | **not run in this session** (running upstream's install was not permitted here). Phase A changes no upstream code; K-11 records the baseline |

## Next phases

| Phase | Item | Status |
|---|---|---|
| 0 audit + 1 ADRs | K-11 | ready |
| 3 multi-user core | K-12 | queued (after K-11) |
| 2, 4–11, launch | spec 124 §2 | not started |
