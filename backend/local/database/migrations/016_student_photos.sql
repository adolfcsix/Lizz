CREATE TABLE student_photo_changes (
  id CHAR(36) PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  prior_photo_id CHAR(36) NULL,
  photo_content MEDIUMTEXT NULL,
  width INT NULL,
  height INT NULL,
  byte_length INT NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT fk_photo_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
  CONSTRAINT fk_photo_actor FOREIGN KEY (actor_id) REFERENCES accounts(id),
  CONSTRAINT fk_photo_prior FOREIGN KEY (prior_photo_id) REFERENCES student_photo_changes(id),
  CONSTRAINT ck_photo_action CHECK (action IN ('REPLACE', 'REMOVE')),
  CONSTRAINT ck_photo_payload CHECK (
    (action = 'REMOVE' AND photo_content IS NULL AND width IS NULL AND height IS NULL AND byte_length = 0)
    OR (action = 'REPLACE' AND photo_content IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND width BETWEEN 64 AND 1024 AND height BETWEEN 64 AND 1024 AND byte_length BETWEEN 100 AND 96000)
  ),
  INDEX ix_photo_student (student_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE student_profiles
  ADD COLUMN photo_id CHAR(36) NULL,
  ADD CONSTRAINT fk_student_photo FOREIGN KEY (photo_id) REFERENCES student_photo_changes(id);
