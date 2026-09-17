CREATE TABLE users (
  id uuid PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  full_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','GUARD','REGISTRAR','DISCIPLINE')),
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE students (
  id uuid PRIMARY KEY,
  student_no varchar(50) NOT NULL UNIQUE,
  full_name varchar(120) NOT NULL,
  rfid_uid varchar(20) UNIQUE,
  course varchar(120) NOT NULL,
  year_level varchar(30) NOT NULL,
  section varchar(40) NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rfid_uid IS NULL OR rfid_uid ~ '^([A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$')
);
CREATE TABLE scan_events (
  id uuid PRIMARY KEY,
  device_id varchar(40) NOT NULL,
  event_id varchar(80) NOT NULL,
  uid varchar(20) NOT NULL,
  result jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id,event_id)
);
CREATE TABLE entry_logs (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  scan_id uuid NOT NULL UNIQUE REFERENCES scan_events(id),
  device_id varchar(40) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('IN','OUT')),
  scanned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entry_logs_student_time_idx ON entry_logs(student_id,scanned_at DESC);
CREATE INDEX entry_logs_time_idx ON entry_logs(scanned_at);
CREATE TABLE violations (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  reported_by uuid NOT NULL REFERENCES users(id),
  description varchar(1000) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLEARED')),
  cleared_by uuid REFERENCES users(id),
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX violations_student_status_idx ON violations(student_id,status);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sync_outbox (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);
CREATE INDEX sync_outbox_pending_idx ON sync_outbox(created_at) WHERE synced_at IS NULL;
