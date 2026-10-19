CREATE TABLE IF NOT EXISTS studio_users (
  id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_workspaces (
  user_id text PRIMARY KEY REFERENCES studio_users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_sessions_expiry ON studio_sessions(expires_at);
CREATE TABLE IF NOT EXISTS studio_files (
  user_id text NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  hash text NOT NULL, mime text NOT NULL, content bytea NOT NULL,
  PRIMARY KEY(user_id, hash)
);
CREATE TABLE IF NOT EXISTS studio_mutations (
  user_id text NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  request_id text NOT NULL, request_hash text NOT NULL, revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, request_id)
);
CREATE TABLE IF NOT EXISTS studio_schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO studio_schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
