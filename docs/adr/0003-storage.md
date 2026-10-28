# ADR 0003 · File storage: named volume + short-lived signed download URLs

- **Status:** Proposed (Phase 1)
- **Date:** 28/10/2026
- **Context sources:** `docs/BUILD-SPEC.md` §5.6; Phase 0 audit §6 and S13, S16–S18.

## Context

Most user content already lives in Postgres: the profile photo is a data URL (`src/lib/photo.ts:1-10`),
documents and versions are rows, and PDFs are rendered on demand. The only files on disk are under
`DOSSIER_DATA_DIR`:

- `downloads/`: "Download all PDFs" zips, fetched by job id (`src/lib/jobs/zip-pdfs.ts:21`,
  `src/app/api/downloads/[id]/route.ts:16-23`);
- `backups/`: install-wide JSON exports (`src/lib/backups.ts:15`, `:28`).

Neither has an owner. The print pages are opened by headless Chromium with a token bound to a path only
(`src/lib/pdf/print-token.ts:18-19`, `:40`). BUILD-SPEC §5.6 asks for a storage interface, opaque keys,
ownership checks and no public bucket. We run on our own VPS (Phase 10 hosting is the VPS), so there is no
object store to buy.

## Decision

- **Interface.** `src/lib/storage/index.ts`:
  - `put(userId, kind, bytes, meta) → key`
  - `get(userId, key)`
  - `delete(userId, key)`
  - `deleteAllFor(userId)`
  - `signedUrl(userId, key, ttl)`

  The only implementation is the local disk, under a Docker **named volume** `career_data` mounted at
  `/data`. The layout is `/data/users/<userId>/<kind>/<key>`, where `key` is a random 128-bit id
  (`randomUUID`), never a user-chosen name. The display name is kept in metadata and set in
  `Content-Disposition`, which already happens via `src/lib/file-name.ts`.
- **Metadata.** A new `FileObject` row: `id`, `userId`, `kind`, `storageKey`, `contentType`, `size`,
  `sha256`, `createdAt`, `expiresAt` (BUILD-SPEC §5.2). `get` and `delete` look the row up through
  `forUser(userId)` (ADR 0002) before touching the disk. A path built from another user's id never resolves.
- **Signed download URLs.** `GET /api/files/<id>?t=<token>`. The token is a JWT signed with a key derived
  from `DOSSIER_SECRET`, through the existing `deriveKey` (`src/lib/keys.ts`) under a new purpose
  `"file-url"`, using `jose`, which is already a dependency. Claims are `{ fid, uid }`, with a **5-minute**
  `exp`. The route checks the signature and expiry, **and** that the session user equals `uid`. A leaked URL
  is useless to anyone else and dies within minutes. Responses use `Cache-Control: private, no-store`
  (already the `route()` default, `src/lib/route.ts:73-79`).
- **One-shot zips.** These stay one-shot: deleted after the first download, as today, plus a sweep after
  24 h through `expiresAt`.
- **Print tokens.** These gain a `uid` claim. The print page renders through `forUser(uid)`, and a token
  minted for A cannot render under B (part of the ADR 0002 matrix).
- **Uploads** (resume import, a Phase 4 concern). Size, extension and magic-byte checks happen before
  parsing, with limits in `src/lib/profile-import*`. A file is parsed in memory and only kept if the user
  saves it.
- **Backups.** These become an operator concern, not a per-user feature:
  - a nightly `pg_dump` of the database plus a tar of `career_data`, into `/opt/backups/career` on the host,
    keeping 7, using the same pattern as CompCode's other apps;
  - upstream's install-wide JSON nightly backup (`src/lib/backup-schedule.ts:40`) is **disabled in
    multi-user mode**, because it would mix users in one file;
  - users get their own export instead (ADR 0002 §5).

  A restore test is Phase 10.
- **Delete my account.** This removes the user's rows (cascade) and calls `deleteAllFor(userId)`.

## Change from Phase A

Phase A mounts a host folder at `/data`, used only by upstream's single-user backups. In Phase 3 the compose
file switches `/data` to the named volume `career_data`, and the host backup line takes over. This is
recorded in `deploy/README.md` at that PR.

## Exit

If the app ever moves off one VPS, the same interface takes an S3-compatible implementation. `signedUrl`
then maps to a presigned URL. No caller changes.

## Files Phase 3 will touch

New `src/lib/storage/index.ts` and `src/lib/storage/local.ts`, new `src/app/api/files/[id]/route.ts`,
`prisma/schema.prisma` (`FileObject`), `src/lib/jobs/zip-pdfs.ts`, `src/app/api/downloads/[id]/route.ts`
(replaced by the files route), `src/lib/pdf/print-token.ts`, `src/lib/pdf/print-access.ts`,
`src/app/print/*`, `src/lib/backups.ts`, `src/lib/backup-schedule.ts`, `src/app/(app)/settings/actions.ts`
(delete), `src/lib/keys.ts` (new purpose), `deploy/compose.prod.yml`, `deploy/README.md`.
