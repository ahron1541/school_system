CREATE TABLE offense_types (
  code varchar(50) PRIMARY KEY,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX offense_types_name_unique ON offense_types(lower(name));
INSERT INTO offense_types(code,name,sort_order) VALUES
 ('NO_ID','No ID Card',10),('LOST_ID','Lost ID',20),('LOITERING','Loitering',30),
 ('LITTERING','Littering',40),('CHARGING','Charging',50),('DISRESPECT','Disrespect',60),
 ('HAIRCUT','Improper Haircut',70),('DRESS_CODE','Improper Dress Code',80),
 ('PROPERTY_DAMAGE','Damage to School Property',90),('CYBER_BULLYING','Cyber Bullying',100),
 ('SLIPPERS','Wearing of Slippers',110),('FABRICATION','Fabrication of Document',120),
 ('UNIFORM','Incomplete School Uniform',130),('PDA','PDA',140),('VANDALISM','Vandalism',150),
 ('HAIR_COLOR','Disturbing Hair Color',160),('INSUBORDINATION','Insubordination',170),
 ('BULLYING','Bullying',180),('ANOTHER_ID','Use of Another Student''s ID',190),
 ('FORGERY','Forgery',200),('ACCESSORIES','Inappropriate Accessories',210),('OTHER','Other',220);

-- Existing free-text reports remain unchanged and are displayed as legacy reports.
ALTER TABLE violations ADD COLUMN offense_code varchar(50) REFERENCES offense_types(code);
ALTER TABLE violations ADD COLUMN custom_offense varchar(160);
ALTER TABLE violations ADD COLUMN offense_date date;
ALTER TABLE violations ADD COLUMN valid_from date;
ALTER TABLE violations ADD COLUMN valid_until date;
ALTER TABLE violations ADD COLUMN remarks varchar(2000) NOT NULL DEFAULT '';
ALTER TABLE violations ADD CONSTRAINT violation_custom_offense CHECK (
 (offense_code='OTHER' AND custom_offense IS NOT NULL AND length(trim(custom_offense)) BETWEEN 3 AND 160)
 OR (offense_code IS DISTINCT FROM 'OTHER' AND custom_offense IS NULL));
ALTER TABLE violations ADD CONSTRAINT violation_validity CHECK (
 (valid_from IS NULL AND valid_until IS NULL) OR
 (valid_from IS NOT NULL AND valid_until IS NOT NULL AND valid_until>=valid_from));
CREATE INDEX violations_created_page_idx ON violations(created_at DESC,id DESC);
CREATE INDEX violations_status_page_idx ON violations(status,created_at DESC,id DESC);
CREATE INDEX violations_offense_idx ON violations(offense_code,created_at DESC);
CREATE INDEX violations_reporter_idx ON violations(reported_by);
ALTER TABLE student_photos ADD COLUMN thumbnail bytea;
