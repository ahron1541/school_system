ALTER TABLE users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN temporary_password_expires_at timestamptz,
  ADD COLUMN account_version integer NOT NULL DEFAULT 1 CHECK (account_version > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_user_idx ON sessions(user_id);
