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
| F7 | Runtime & code error diagnosis (copy-paste, never auto-applied) | ✅ |
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
| POST | `/api/diagnose` | `{yaml?, log?, text?, repo_url?, replay_id?}` → rules engine + LLM → diagnosis JSON |
| POST | `/api/apply-fix` | `{replay_id, fixed_yaml}` → commit the fix to the patient repo, Zerops redeploys on push (config errors only) |
| GET | `/api/status/:replay_id` | poll deploy status; appends timeline events on state change |
| GET | `/api/replay/:id` | public, read-only replay data — no auth |
| GET | `/api/patterns/:id/stats` | F5 stat-tile data |
| GET | `/api/watch/status` | F8 — polled every ~30s while Watch Mode is on |

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
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `PATIENT_REPO` — enables F2's
  apply-fix (commits the corrected `zerops.yaml` to the patient repo via a
  GitHub App installation token; see "GitHub App setup" below)
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
6. **Install** the app on your account, selecting only the patient repo
7. Set `GITHUB_APP_ID` (shown on the app's settings page) and
   `GITHUB_APP_PRIVATE_KEY` (the `.pem` file's contents — if your env var UI
   doesn't accept multi-line values, replace real newlines with literal
   `\n`, the code un-escapes either form) on the `api` service

`apps/api/src/lib/githubApp.js` signs a JWT with that key and exchanges it
for a ~1-hour installation access token on demand — single-tenant by
design (one App, one installation, looked up and cached), since a
multi-user version would need stored installation mappings and sessions
DeployDoctor doesn't have (see roadmap).

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
  GitHub App with short-lived installation tokens (see "GitHub App setup"),
  but it's single-tenant — one App, one installation, one repo, configured
  once server-side. A general "connect any repo" version would need a
  per-user install flow (`/auth/github/install` → callback → stored
  installation mapping) and, more fundamentally, something DeployDoctor
  doesn't have today: user accounts/sessions, since replays are currently
  anonymous and public by design.

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
