CREATE TABLE student_profiles (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
