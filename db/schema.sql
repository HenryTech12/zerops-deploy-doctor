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
  title      TEXT,
  username   TEXT                            -- GitHub login, captured via OAuth on the landing
                                              -- page; nullable — replays stay anonymous/public
                                              -- by design (F6) when no one signed in
);

ALTER TABLE replays ADD COLUMN IF NOT EXISTS username TEXT;
CREATE INDEX IF NOT EXISTS idx_replays_username ON replays(username);

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

-- Legacy singleton row — superseded by repo_sessions below (kept only so
-- migrate.js can carry an existing connection forward into a named session
-- the first time this runs against a database that still has one).
CREATE TABLE IF NOT EXISTS repo_connection (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner      TEXT NOT NULL,
  repo       TEXT NOT NULL,
  branch     TEXT NOT NULL DEFAULT 'main',
  yaml_path  TEXT NOT NULL DEFAULT 'zerops.yaml',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Named, saved repo connections — replaces the single hardcoded connection
-- so users can save more than one repo they work with and switch between
-- them. Still single-tenant underneath (one GitHub App installation, no
-- per-user data isolation — see README roadmap): "active" just means
-- "the one F2 apply-fix / Analyze codebase currently targets," shared by
-- whoever opens the dashboard, same as the old singleton was.
CREATE TABLE IF NOT EXISTS repo_sessions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner      TEXT NOT NULL,
  repo       TEXT NOT NULL,
  branch     TEXT NOT NULL DEFAULT 'main',
  yaml_path  TEXT NOT NULL DEFAULT 'zerops.yaml',
  username   TEXT,                      -- who created it, if signed in (nullable)
  is_active  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enforces "at most one active session" at the database level rather than
-- trusting application code to always clear the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_sessions_one_active
  ON repo_sessions ((is_active)) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_repo_sessions_username ON repo_sessions(username);
