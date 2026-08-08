# DeployDoctor

**ZCP fixes your deploy for you. DeployDoctor shows you exactly how — and lets anyone watch the replay.**

An AI-powered deployment doctor for [Zerops](https://zerops.io). It diagnoses
failing deployments — whether the fault is in the config **or in the code** —
explains the root cause in plain English, fixes what it owns, advises on what
it doesn't, and records every diagnose → fix → redeploy cycle on a shareable
replay timeline.

Built for **The Zerops Challenge** (WeMakeDevs × Zerops), August 8–9, 2026.

## The scope boundary

> Auto-fix what the tool owns (infrastructure config). Advise on what the
> user owns (their code).

Config errors get a diff and a one-click apply-and-redeploy. Code errors get
a copy-paste fix the user applies and pushes themselves — DeployDoctor never
writes to a user's repository. Nothing deploys without an explicit user
click.

## The core loop

1. Connect a project / paste a `zerops.yaml` + failing log / type a
   plain-English problem — or flip on **Watch Mode** and let DeployDoctor
   catch failures by itself.
2. A rules engine + an LLM (Groq, gpt-oss) diagnose the root cause.
3. **Config errors:** the LLM proposes a corrected `zerops.yaml` as a diff →
   click Apply → the fix is committed straight to the patient repo →
   Zerops's own push-to-branch pipeline trigger redeploys it → status
   polled until healthy.
4. **Code errors:** with repo access, DeployDoctor locates the offending file
   and line and shows a copy-paste replacement.
5. Every cycle lands on the **Deploy Replay Timeline** — a public, shareable
   URL.
6. Every fix teaches (Learning Mode) and feeds honest community stats (Fix
   Intelligence) — real numbers only, however small.

## Architecture

```
                    ┌──────────────────────────────┐
   public traffic → │  frontend (Next.js)           │
                    │  input · diff view · timeline │
                    │  replay pages · watch toggle  │
                    └────────────┬─────────────────┘
                                 │ HTTP (private network)
                    ┌────────────▼─────────────────┐
                    │  api (Node.js / Express)      │
                    │  - yaml + log rules engine    │
                    │  - Groq (gpt-oss) orchestration│
                    │  - Zerops API client          │
                    │  - GitHub source fetch (F7)   │
                    │  - status poller (F2 + F8)    │
                    └───┬───────────────┬──────────┘
                        │               │
            ┌───────────▼────┐   ┌──────▼──────────┐
            │ Postgres        │   │ Groq API          │
            │ failure_patterns│   │ (diagnose / fix / │
            │ replays         │   │  route calls)     │
            │ replay_events   │   └──────────────────┘
            └────────────────┘
                        │
              ┌─────────▼──────────┐        ┌────────────────────┐
              │ Zerops API          │        │ Patient App         │
              │ status · logs ·     │───────▶│ (separate Zerops    │
              │ trigger redeploy    │        │  project, 4 breaks) │
              └────────────────────┘        └────────────────────┘
```

Three Zerops services in the main project — `frontend`, `api`, `db` (managed
Postgres) — over private networking, plus live platform-API usage for
status, logs, and redeploys against a separate patient-app project. Not a
single static container.

## Repository layout

```
apps/
  api/           Express service — rules engine, Groq (gpt-oss) calls, Zerops client,
                 GitHub fetch, and the six HTTP routes below
  frontend/      Next.js dashboard, replay pages, design system
  patient-app/   the "patient" — a tiny hello API DeployDoctor diagnoses live
                 (healthy on this branch; see break/* branches below)
db/              schema.sql, seed.sql (categories 1–3), migrate.js, seed.js
zerops.yaml      main project: frontend + api + db
```

## Features

| | Feature | Status |
|---|---|---|
| F1 | AI diagnosis (rules engine + Groq gpt-oss) | ✅ core |
| F2 | Auto-fix with diff approval, retry memory, max-3-loop guard | ✅ core |
| F3 | Natural-language input | ✅ folded into `/api/diagnose` |
| F4 | Learning Mode (`next_time_tip`, difficulty) | ✅ core |
| F5 | Community Fix Intelligence — real counts only | ✅ |
| F6 | Deploy Replay Timeline — public `/replay/:id` | ✅ signature feature |
| F7 | Runtime & code error diagnosis (copy-paste, or "Analyze codebase" on a connected repo — never auto-applied) | ✅ |
| F8 | Watch Mode — page-open polling, edge-triggered auto-diagnosis | ✅ |
| F9 | Learning from failed fixes (`failed_fixes` table) | ✅ |

## Data model

See [`db/schema.sql`](db/schema.sql): `failure_patterns`, `failed_fixes`,
`replays`, `replay_events`. Seed data for rules-engine categories 1–3 lives
in [`db/seed.sql`](db/seed.sql). Category 4 (runtime/code) is LLM-led by
design — its `failure_patterns` rows are created the first time the API
diagnoses a new code error, so it participates in F5/F9 like any other
pattern.

## API surface

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/diagnose` | `{yaml?, log?, text?, repo_url?, use_connected_repo?, file_paths?, replay_id?, username?}` → rules engine + LLM → diagnosis JSON |
| POST | `/api/apply-fix` | `{replay_id, fixed_yaml}` → validates the fix is a real Zerops schema, then commits it to the patient repo; Zerops redeploys on push (config errors only) |
| GET | `/api/status/:replay_id` | poll deploy status; appends timeline events on state change |
| GET | `/api/replay/:id` | public, read-only replay data — no auth |
| GET | `/api/replay?username=` | recent diagnoses for a signed-in username — powers "Recent diagnoses" |
| GET | `/api/auth/github/login` | starts "Continue with GitHub"; falls straight through to `/dashboard` if OAuth isn't configured |
| GET | `/api/auth/github/callback` | OAuth callback — redirects back to `/dashboard?gh_user=...` |
| GET | `/api/patterns/:id/stats` | F5 stat-tile data |
| GET | `/api/watch/status` | F8 — polled every ~30s while Watch Mode is on |
| GET | `/api/github/app-info` | GitHub App slug + install URL, for the "Connect repo" button |
| GET | `/api/github/repos` | repos the App's installation currently has access to |
| GET | `/api/github/repos/:owner/:repo/files` | yaml/yml files in that repo, for the file picker |
| GET | `/api/github/repos/:owner/:repo/branches` | branches in that repo, for the branch picker |
| GET | `/api/github/repos/:owner/:repo/source-files` | source-code files in that repo, for the "Analyze codebase" file picker |
| GET | `/api/github/connection` | the currently connected owner/repo/branch/file |
| POST | `/api/github/connection` | `{owner, repo, branch?, yaml_path?}` → save the active connection |
| GET | `/api/github/connection/content` | current content of the connected file — prefills the diagnose form |

## Running locally

Requires Node 22 and a local Postgres.

```bash
npm install                 # installs all workspaces from the repo root

createdb deploydoctor
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deploydoctor
npm run db:migrate
npm run db:seed

npm run dev:api              # apps/api      → http://localhost:3001
npm run dev:frontend         # apps/frontend → http://localhost:3000
npm run dev:patient          # apps/patient-app → http://localhost:3000 (use a different PORT)
```

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

- `GROQ_API_KEY` — enables real LLM diagnosis via Groq (Call A on
  `openai/gpt-oss-120b`, Call B on `openai/gpt-oss-20b`; without it, the API
  falls back to rules-engine-only answers, which is exactly what the browser
  smoke test above exercised)
- `API_TOKEN`, `PATIENT_PROJECT_ID`, `PATIENT_SERVICE_ID` — enables status
  polling and Watch Mode against a real Zerops service (named without a
  `ZEROPS_` prefix — Zerops's own dashboard rejects user-defined env vars
  starting with it)
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` — enables F2's apply-fix (commits
  the corrected `zerops.yaml` to whichever repo is connected via the
  dashboard's "Connect repo" UI, using a GitHub App installation token; see
  "GitHub App setup" below). `PATIENT_REPO`/`PATIENT_REPO_BRANCH` are an
  optional fallback used only until a connection is saved through the UI.
- `GITHUB_TOKEN` — optional, raises F7's GitHub API rate limit

The frontend reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`).

## GitHub App setup (for F2 apply-fix)

DeployDoctor commits a config fix straight to the patient repo rather than
calling Zerops's deploy API directly — that endpoint's exact shape isn't
confirmed working, while GitHub's push already reliably triggers a Zerops
redeploy via the pipeline trigger configured on that repo. Write access
comes from a GitHub App installation (short-lived, scoped tokens — the same
pattern Vercel/Netlify use), not a static personal access token:

1. GitHub → Settings → Developer settings → **GitHub Apps** → **New GitHub App**
2. Fill in a name and homepage URL; you can leave the webhook unchecked (not needed)
3. Under **Permissions → Repository permissions**, set **Contents: Read and write**
4. **Where can this app be installed:** "Only on this account" is fine
5. Create the app, then **Generate a private key** — downloads a `.pem` file
6. Set `GITHUB_APP_ID` (shown on the app's settings page) and
   `GITHUB_APP_PRIVATE_KEY` on the `api` service. **Recommended:** base64-encode
   the `.pem` file first and paste that instead of the raw contents —
   multi-line PEM pasted into a single-line env var field gets mangled in
   enough different ways (dropped newlines, added quotes) that base64 is the
   only form confirmed to survive every env var UI reliably:
   ```
   base64 -w0 your-key.pem   # macOS: base64 -i your-key.pem
   ```
   The raw `.pem` contents still work too (the code detects and repairs the
   common mangled forms), but if you hit a signing error, switch to base64.

`apps/api/src/lib/githubApp.js` signs a JWT with that key and exchanges it
for a ~1-hour installation access token on demand.

You don't need to manually install the App on a repo — the dashboard's
**Connect repo** panel links straight to GitHub's own "Install/manage" page
for the App (same flow Vercel/Netlify use). After installing on one or more
repos there, back in DeployDoctor: **Refresh repo list** → pick the repo,
branch, and yaml file → **Save connection**. That connection (stored in the
`repo_connection` table) is what F2's apply-fix commits to; single-tenant by
design (one App, one installation, one active connection at a time — see
roadmap for multi-user).

Once a repo is connected, the dashboard's diagnose form auto-loads its real
`zerops.yaml` (no copy-paste needed — just paste the error log), and an
**Analyze codebase** button on the connection card opens a file picker (up
to 8 files, searchable, with an "Auto-select" that guesses likely
entrypoints) and runs F7 straight against whichever files you choose — no
pasted error required at all, useful for the "something's wrong but I don't
have a log yet" case. "Auto-detect for me" skips picking entirely and falls
back to the same entrypoint-name heuristic F7 always used.

## GitHub sign-in (landing page, optional)

`/` is a landing page with a **Continue with GitHub** button; `/dashboard`
is the app itself, fully usable signed-out (there's also a "Skip" link
straight there). Signing in only tags your diagnoses with your GitHub
username so a "Recent diagnoses" list and refresh-safe history work — it's
not an access gate, and no server-side session is created (the username is
handed back as a redirect query param and stored in `localStorage`).

This reuses the **same GitHub App** from the section above — no second app
registration — via its standard user-to-server OAuth flow:

1. On the App's settings page, note the **Client ID** and generate/copy a
   **Client secret** (both live in the "General" section, above where the
   private key lives)
2. Set the App's **Callback URL** to `<api's public URL>/api/auth/github/callback`
   (e.g. `https://api-2ab2-3001.prg1.zerops.app/api/auth/github/callback`) —
   GitHub's OAuth `redirect_uri` must match this exactly
3. Set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and
   `API_PUBLIC_URL` (the same API URL as step 2, no trailing slash/path) on
   the `api` service

If any of those three aren't set, `/api/auth/github/login` just redirects
straight to `/dashboard` — signing in degrades gracefully instead of
breaking anything.

## The patient app

[`apps/patient-app`](apps/patient-app) is deployed as its **own** Zerops
project — the app DeployDoctor diagnoses and fixes live, no mocking. This
branch has the healthy baseline; four sibling branches each introduce one
deliberate, realistic break:

| Branch | Break | Category | Exercises |
|---|---|---|---|
| `break/1-missing-httpsupport` | `httpSupport` removed | Configuration | F1+F2 full auto-fix loop |
| `break/2-wrong-base-version` | invalid `base` version | Build & Deploy | F1+F2 full auto-fix loop |
| `break/3-bad-db-hostname` | private DB hostname misconfigured | Network & VPN | rules-engine category 3 |
| `break/4-missing-env-var` | endpoint throws on a missing env var | Code (runtime) | F7 copy-paste flow |

Deploy whichever branch to the patient's Zerops project to re-break it on
demand; redeploy `main` (or use DeployDoctor itself) to heal it.

## How Zerops is used

- **Three services, private networking:** `frontend` and `api` take public
  traffic; `api` reaches managed Postgres (`db`) over the private network
  only.
- **Live platform-API usage:** the `api` service calls the Zerops REST API
  for service status, deploy logs, and redeploy triggers — not just at
  deploy time, but continuously while Watch Mode is on and while a fix is
  being applied and polled.
- **A real second project as the test subject:** the patient app is a
  separate Zerops project with its own real failures, logs, and redeploys —
  DeployDoctor's diagnoses are never fabricated or mocked.

## Design system

Dark IDE-style theme — see [`apps/frontend/tailwind.config.js`](apps/frontend/tailwind.config.js)
for the full token set: coral for failures/removed diff lines, teal for
success/added diff lines/primary actions, amber for pending/difficulty/watch
states, blue reserved for AI-generated content only. Space Grotesk for
display, Inter for body text, JetBrains Mono for yaml/logs/diffs.

## Roadmap (v2, out of scope for this build)

- **Watch Mode v2:** webhooks and background monitoring instead of
  page-open polling, plus push/email notifications on a caught failure.
- **Browser extension** overlaying DeployDoctor diagnoses directly on the
  Zerops dashboard.
- **Level 3 learning:** fine-tuning or a learned fix-ranking model on top of
  the `failed_fixes` table (F9 today is prompt injection only, by design).
- **Multi-tenant repo connections:** F2's apply-fix already uses a real
  GitHub App with short-lived installation tokens and a dashboard "Connect
  repo" UI (pick the repo/branch/file, not hardcoded — see "GitHub App
  setup"), but it's single-tenant — one App, one installation, one active
  connection shared by everyone who opens the dashboard. GitHub sign-in
  (see "GitHub sign-in") gives DeployDoctor a lightweight notion of "who,"
  but it's tagging, not accounts — no server-side session, no per-user
  data isolation. A general "connect any repo, per user" version would
  still need per-user install callbacks and real sessions on top of that.

## Known limitations

- The exact Zerops REST API field names used by `apps/api/src/lib/zerops.js`
  for service status and deploy logs (F8 Watch Mode) are written against
  the public API docs and may need adjustment against a live project — the
  client is deliberately isolated in one file for that reason. F2's
  apply-fix deliberately avoids this risk entirely: confirmed live that
  guessing at Zerops's deploy-trigger endpoint 404'd, so it commits the fix
  to the patient repo instead and lets Zerops's own proven push-to-branch
  pipeline trigger handle the redeploy.
- `apps/frontend` depends on Next.js 14.2.35 (the latest patched 14.x
  release); a handful of advisories in Next's own bundled build-time
  `postcss` remain open upstream until a Next 16 major upgrade — not
  something exposed at runtime in this app, but worth revisiting.

## AI-tool disclosure

- **In-product:** Groq (`openai/gpt-oss-120b` for diagnosis/fix, `openai/gpt-oss-20b`
  for natural-language routing) powers diagnosis, fix generation, and
  natural-language routing (`apps/api/src/lib/llm.js`) — this is the
  product, not an implementation detail.
- **Built with:** this repository — architecture, backend, frontend, patient
  app, and its four breakable variants — was built end-to-end with Claude
  Code.

## License

MIT
