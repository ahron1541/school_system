CREATE TABLE violation_reads (
  violation_id uuid NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (violation_id,user_id)
);
CREATE INDEX violation_reads_user_idx ON violation_reads(user_id,violation_id);
CREATE TABLE violation_remarks (
  id uuid PRIMARY KEY,
  violation_id uuid NOT NULL REFERENCES violations(id),
  author_id uuid NOT NULL REFERENCES users(id),
  remarks text NOT NULL CHECK (length(trim(remarks)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX violation_remarks_case_idx ON violation_remarks(violation_id,created_at,id);
