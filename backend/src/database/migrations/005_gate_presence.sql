CREATE TABLE semesters (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX semesters_one_active ON semesters(active) WHERE active;
CREATE TABLE semester_validations (
  student_id uuid NOT NULL REFERENCES students(id),
  semester_id uuid NOT NULL REFERENCES semesters(id),
  uid varchar(20) NOT NULL,
  validated_by uuid NOT NULL REFERENCES users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(student_id, semester_id, uid),
  CHECK(uid ~ '^([A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$')
);
ALTER TABLE scan_events ADD COLUMN sequence bigserial;
CREATE UNIQUE INDEX scan_events_sequence_idx ON scan_events(sequence);
ALTER TABLE scan_events ADD COLUMN occurred_at_device timestamptz;
ALTER TABLE scan_events ADD COLUMN request_hash char(64);
CREATE TABLE student_presence (
  student_id uuid PRIMARY KEY REFERENCES students(id),
  status text NOT NULL CHECK(status IN ('INSIDE','OUTSIDE','UNKNOWN')),
  reason text,
  last_gate_event_id uuid REFERENCES scan_events(id),
  session_date date,
  session_end timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_presence_unresolved_idx ON student_presence(session_end) WHERE status='INSIDE';
CREATE TABLE presence_changes (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason varchar(500) NOT NULL,
  actor_id uuid REFERENCES users(id),
  related_event_id uuid REFERENCES scan_events(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX presence_changes_student_time_idx ON presence_changes(student_id,created_at DESC);
CREATE TABLE gate_device_health (
  device_id varchar(40) PRIMARY KEY,
  last_seen_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN ('ONLINE','DEGRADED'))
);
INSERT INTO student_presence(student_id,status,reason,last_gate_event_id)
SELECT s.id,CASE WHEN e.direction='IN' THEN 'UNKNOWN' ELSE 'OUTSIDE' END,
CASE WHEN e.direction='IN' THEN 'DATA_MIGRATION' ELSE NULL END,e.scan_id
FROM students s LEFT JOIN LATERAL (
  SELECT direction,scan_id FROM entry_logs WHERE student_id=s.id ORDER BY scanned_at DESC,id DESC LIMIT 1
) e ON true;
