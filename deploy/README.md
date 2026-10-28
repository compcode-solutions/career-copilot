# Deploying Career Copilot on the VPS (runbook for Cursor, CURSOR.md C-02)

Phase A (spec 124 Amendment 1): upstream Dossier's released image, unchanged, single user (the owner), at
`https://career.compcodesolutions.com`. Every command below runs as written; nothing needs judgment.
**Never print a secret into a file in git, a chat, a PR or the tracker `result`.**

Facts used here: VPS `169.58.144.97` (Contabo, Ubuntu 24.04, Traefik on the external `coolify` network,
apps in `/opt/apps`, env files in `/opt/apps/env/`), same as Relay and the founder portal.

## 0 · Before you start

```bash
free -m                      # stop here if "available" is under 1024 MB, and report it
nslookup career.compcodesolutions.com
```

If `nslookup` does not answer `169.58.144.97`: Hostinger → DNS for compcodesolutions.com → add an **A** record
`career` → `169.58.144.97` (TTL default). Wait until `nslookup` answers it.

```bash
docker manifest inspect ghcr.io/aientech/dossier:v1.9.2 > /dev/null && echo "image tag OK"
```

If that fails, try `v1.9.1`, then `v1.9.0`, and use the first that works as `DOSSIER_IMAGE_TAG` in step 2
(say which in `result`; Cowork then updates the default in `deploy/compose.prod.yml`).

## 1 · Code and folders

```bash
sudo mkdir -p /opt/apps/env /opt/backups/career
sudo chown 1000:1000 /opt/backups/career          # the image runs as "node" (uid 1000); it writes backups here
cd /opt/apps && git clone https://github.com/compcode-solutions/career-copilot career
cd /opt/apps/career && git log -1 --oneline
```

## 2 · The env file (secrets live only here)

Run this block in one SSH session. It prints the **login password once**; copy it straight into
the owner's private secrets file (path in CompCode's private tracker, item C-02), outside every git repo, and nowhere else.

```bash
set -eu
TAG=v1.9.2                                         # or the tag step 0 settled on
umask 077
PG=$(openssl rand -hex 24)                          # URL-safe: it goes inside DATABASE_URL
SECRET=$(openssl rand -base64 32)
LOGIN=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
# hash-password reads the first line of stdin when stdin is not a terminal
# (upstream scripts/hash-password.ts), so no -t here.
HASH=$(printf '%s\n' "$LOGIN" | docker run --rm -i "ghcr.io/aientech/dossier:$TAG" hash-password)
case "$HASH" in argon2id:*) ;; *) echo "hash-password failed"; exit 1;; esac
cat > /opt/apps/env/career.env <<ENV
POSTGRES_PASSWORD=$PG
DOSSIER_SECRET=$SECRET
DOSSIER_PASSWORD=$HASH
DOSSIER_IMAGE_TAG=$TAG
TZ=Asia/Kolkata
DOSSIER_BACKUP_RETENTION_DAYS=7
DOSSIER_TELEMETRY=off
DOSSIER_PUBLIC_URL=https://career.compcodesolutions.com
ENV
chmod 600 /opt/apps/env/career.env
echo "LOGIN PASSWORD (save it to the private secrets file, then clear the terminal): $LOGIN"
unset PG SECRET LOGIN HASH
```

The hash has no `$` in it (upstream's own format, `src/lib/auth/password-hash.ts`), so the env file needs no quoting.

### AI provider (Gemini, through its OpenAI-compatible endpoint)

Dossier's `openai` provider calls `<DOSSIER_AI_URL>/chat/completions` (upstream `src/lib/ai/providers.test.ts`), and
Google documents `https://generativelanguage.googleapis.com/v1beta/openai/` as Gemini's OpenAI-compatible base URL
(https://ai.google.dev/gemini-api/docs/openai). Find the Gemini key and model CompCode already uses on the VPS,
**printing names only**:

```bash
grep -l -i gemini /opt/apps/env/*.env
grep -h -o -i '^[A-Z_]*GEMINI[A-Z_]*=' /opt/apps/env/*.env | sort -u    # variable names, no values
```

Then append four lines to `/opt/apps/env/career.env` with an editor (not `echo`, so the key stays out of shell
history), copying the key's value from that file:

```
DOSSIER_AI_PROVIDER=openai
DOSSIER_AI_URL=https://generativelanguage.googleapis.com/v1beta/openai
DOSSIER_AI_MODEL=<the model name in the same file, e.g. its GEMINI_MODEL; if none, gemini-3.8-flash>
DOSSIER_AI_KEY=<that key>
```

If no Gemini key is on the VPS, skip this; the owner can enter a provider later in Settings → AI provider.

## 3 · Deploy-on-merge wiring (once)

1. Add `career` to `/opt/apps/deploy-dispatch.sh` the same way `founder-portal` was added (C-07 step 5):
   dir `/opt/apps/career`, compose `deploy/compose.prod.yml`, env `/opt/apps/env/career.env`, project `career`,
   `git pull` on `main` before `up -d`. There is nothing to build: `up -d` pulls the pinned image.
2. GitHub → compcode-solutions/career-copilot → Settings → Secrets and variables → Actions: add `DEPLOY_KEY`,
   `DEPLOY_HOST`, `DEPLOY_USER` with the same values Relay_CCS uses.
3. GitHub → career-copilot → Actions: if it says workflows are disabled on this fork, enable them. Then disable
   upstream's own `CI`, `Release` and `Pages` workflows there (they build and publish upstream's image and site; we
   only use `Deploy (VPS)`). With gh: `gh workflow disable ci.yml -R compcode-solutions/career-copilot` and the same
   for `release.yml`, `pages.yml`.

## 4 · First start

```bash
cd /opt/apps/career
docker compose -p career -f deploy/compose.prod.yml --env-file /opt/apps/env/career.env up -d
sleep 60
docker compose -p career -f deploy/compose.prod.yml --env-file /opt/apps/env/career.env ps   # app "healthy"
docker logs career-app-1 --tail 20        # migrations + seed ran, server listening; no secrets are logged
curl -sS -o /dev/null -w '%{http_code}\n' https://career.compcodesolutions.com/api/health     # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://career.compcodesolutions.com/                # 200 or 307 to sign-in
free -m
```

Paste in `result`: the image tag, both curl codes, `free -m` before and after, and that the password was saved (never the password).

## 5 · Backups

Upstream writes a nightly backup at 03:00 IST into `/data` (= `/opt/backups/career` on the VPS) and keeps
`DOSSIER_BACKUP_RETENTION_DAYS` (7) days of them. Check the next morning: `ls -la /opt/backups/career`.
The weekly pull to the owner's PC should include `/opt/backups/career` (add it to whatever the pull copies; Cowork has not
checked that script). A restore test is Phase 10.

## 6 · For the owner (after step 4)

Sign in at https://career.compcodesolutions.com with the password from the private secrets file.
Start a profile from your resume, paste one job description, export the tailored resume PDF.

## Upgrading later

Read the upstream release notes, change `DOSSIER_IMAGE_TAG` default in `deploy/compose.prod.yml` (and in
`career.env` if set there) in a PR, merge. Upstream advises a backup first; the nightly one counts if it is from
the same day.
