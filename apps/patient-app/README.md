# The patient app

> **This branch is BROKEN on purpose** (variant 2 — see table below): `base`
> is pinned to `nodejs@99`, a version Zerops doesn't publish, so the build
> fails before the app ever starts. Deploy this branch to re-break the
> patient for a Build & Deploy-category diagnosis.

A deliberately tiny Node/Express "hello API" with a Postgres ping endpoint —
the app DeployDoctor diagnoses and fixes live. No mocking anywhere: this is a
real deployable service, meant to run on Zerops as its own project (separate
from the main DeployDoctor project) so it has its own real failures, logs,
and redeploys.

## Endpoints

- `GET /` — hello message
- `GET /health` — liveness check
- `GET /db-ping` — pings Postgres via `DATABASE_URL`, returns the server time
- `GET /greet` — reads the required `GREETING_NAME` env var

## Running locally

```bash
npm install
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/patient \
GREETING_NAME=DeployDoctor \
npm run start
```

## Breakable variants

This branch (`main`) is the healthy baseline. Four other branches each
introduce one deliberate, realistic break so DeployDoctor's diagnosis and
fix pipeline can be exercised end-to-end against a real failing deploy —
re-break the patient on demand by deploying whichever branch you need.

| Branch | Break | Category | Exercises |
|---|---|---|---|
| `break/1-missing-httpsupport` | `httpSupport` removed from `zerops.yaml` | Configuration | F1+F2 full auto-fix loop |
| `break/2-wrong-base-version` | invalid `base` version in `zerops.yaml` | Build & Deploy | F1+F2 full auto-fix loop |
| `break/3-bad-db-hostname` | private DB hostname misconfigured | Network & VPN | rules-engine category 3 |
| `break/4-missing-env-var` | `/greet` throws on a missing env var | Code (runtime) | F7 copy-paste flow |

To re-break the patient: `git checkout break/<n>-...` and redeploy that
branch to the patient's Zerops project. To heal it, redeploy `main` — or use
DeployDoctor itself.
