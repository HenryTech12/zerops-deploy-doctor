-- Seed data for failure_patterns — categories 1-3 (rules-engine signatures).
-- Category 4 (runtime_code) is LLM-led by design (no fixed signature) but still
-- gets rows created dynamically by the API the first time a new code-error
-- pattern is diagnosed, so it participates in F5/F9 like any other pattern.

INSERT INTO failure_patterns (category, signature, title, canonical_fix, docs_url, difficulty)
VALUES
  -- Category 1: Build & Deploy
  ('build_deploy',
   '(?i)(unsupported|invalid|unknown)\s+base\b|base version.*not found|no matching version found for base',
   'Unsupported or invalid `base` version',
   'Bump the `base` field under `build` and/or `run` to a supported version tag (e.g. `nodejs@22`). Check the Zerops base image list for the current supported tags.',
   'https://docs.zerops.io/references/base-images',
   'Beginner'),

  ('build_deploy',
   '(?i)command not found|npm err! missing script|cannot find module.*package\.json|buildCommands.*failed|exit code 1.*build',
   'Build command failed or is missing a dependency manifest',
   'Ensure `buildCommands` run in the correct order (install before build) and that `package.json` / lockfile is present in `deployFiles`.',
   'https://docs.zerops.io/references/zerops-yaml',
   'Beginner'),

  ('build_deploy',
   '(?i)yaml.*(parse|syntax) error|unexpected (key|mapping)|bad indentation|invalid zerops\.yaml',
   'Invalid `zerops.yaml` structure',
   'Fix the offending key/indentation in `zerops.yaml` against the documented schema — a single misplaced key breaks the whole service definition.',
   'https://docs.zerops.io/references/zerops-yaml',
   'Beginner'),

  -- Category 2: Configuration
  ('configuration',
   '(?i)connection refused.*(localhost|127\.0\.0\.1)|no response.*port|httpSupport.*(missing|false)|502 bad gateway',
   'Missing `httpSupport: true` on the exposed port',
   'Add `httpSupport: true` under the matching `ports` entry in `run.ports` so Zerops routes public HTTP traffic to the container.',
   'https://docs.zerops.io/references/zerops-yaml#ports',
   'Beginner'),

  ('configuration',
   '(?i)EADDRINUSE|listen (EACCES|failed)|port mismatch|app.*listen(ing)? on port \d+.*expected \d+',
   'Port mismatch between container and `zerops.yaml`',
   'Make the port the app actually listens on match the `port` value declared in `run.ports` (or vice versa).',
   'https://docs.zerops.io/references/zerops-yaml#ports',
   'Beginner'),

  ('configuration',
   '(?i)(env(ironment)? variable|env var).*(not set|undefined|missing)|getenv.*null|process\.env\.\w+ is undefined',
   'Required environment variable not set',
   'Add the missing key under `run.envSecrets` (or `run.env`) in `zerops.yaml` and reference it from the connected service where relevant.',
   'https://docs.zerops.io/references/zerops-yaml#envsecrets',
   'Beginner'),

  -- Category 3: Network & VPN
  ('network_vpn',
   '(?i)(ENOTFOUND|getaddrinfo).*\.zerops\.local|could not resolve host|private (db|hostname|network).*unreachable|connect ETIMEDOUT.*internal',
   'Local app cannot reach a private Zerops service (DB/cache)',
   'Restart the local development VPN session with `zcli vpn up` — private hostnames only resolve while the VPN tunnel is active.',
   'https://docs.zerops.io/references/vpn',
   'Beginner'),

  ('network_vpn',
   '(?i)wrong (db )?hostname|hostname.*misconfigured|ECONNREFUSED.*(db|postgres|5432)',
   'Private DB hostname misconfigured',
   'Use the internal Zerops hostname exactly as shown on the service detail page (e.g. `db`), not `localhost` or a public address.',
   'https://docs.zerops.io/references/access',
   'Intermediate')
ON CONFLICT (title) DO NOTHING;
