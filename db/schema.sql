-- DeployDoctor schema
-- Run via `npm run db:migrate` (idempotent — safe to re-run).

CREATE TABLE IF NOT EXISTS failure_patterns (
  id                 SERIAL PRIMARY KEY,
  category           TEXT NOT NULL,          -- build_deploy | configuration | network_vpn | runtime_code
  signature          TEXT,                   -- regex/keyword match; NULL for LLM-led runtime_code
  title              TEXT NOT NULL UNIQUE,
  canonical_fix      TEXT NOT NULL,
  docs_url           TEXT,
  difficulty         TEXT DEFAULT 'Beginner',
  seen_count         INT  DEFAULT 0,
  fixed_count        INT  DEFAULT 0,
  total_fix_seconds  BIGINT DEFAULT 0        -- avg = total / fixed_count
);

CREATE TABLE IF NOT EXISTS failed_fixes (
  id          SERIAL PRIMARY KEY,
  pattern_id  INT REFERENCES failure_patterns(id),
  fix_summary TEXT NOT NULL,                 -- the fix that was applied and did not resolve the failure
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replays (
  id         TEXT PRIMARY KEY,               -- short shareable slug
  created_at TIMESTAMPTZ DEFAULT now(),
  title      TEXT
);

CREATE TABLE IF NOT EXISTS replay_events (
  id          SERIAL PRIMARY KEY,
  replay_id   TEXT REFERENCES replays(id),
  attempt_n   INT NOT NULL,
  status      TEXT NOT NULL,                 -- fail | success | pending
  error_type  TEXT,                          -- config | code
  cause       TEXT,
  fix_summary TEXT,
  pattern_id  INT REFERENCES failure_patterns(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replay_events_replay_id ON replay_events(replay_id);
CREATE INDEX IF NOT EXISTS idx_failed_fixes_pattern_id ON failed_fixes(pattern_id);

-- Singleton row (id always 1) — which repo/branch/file F2 apply-fix commits
-- to, set via the "Connect repo" UI instead of the old static PATIENT_REPO
-- env var. Single-tenant app (one GitHub App installation), so one active
-- connection is enough — no need for a per-user table.
CREATE TABLE IF NOT EXISTS repo_connection (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner      TEXT NOT NULL,
  repo       TEXT NOT NULL,
  branch     TEXT NOT NULL DEFAULT 'main',
  yaml_path  TEXT NOT NULL DEFAULT 'zerops.yaml',
  updated_at TIMESTAMPTZ DEFAULT now()
);
