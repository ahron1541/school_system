ALTER TABLE scan_events ADD COLUMN student_id uuid REFERENCES students(id);
UPDATE scan_events se SET student_id=e.student_id FROM entry_logs e WHERE e.scan_id=se.id;
CREATE INDEX scan_events_device_time_idx ON scan_events(device_id,received_at DESC,id);

CREATE TABLE student_photos (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  image bytea NOT NULL CHECK(octet_length(image) <= 524288),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE violations ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX violations_report_request_idx ON violations(reported_by,request_id) WHERE request_id IS NOT NULL;
