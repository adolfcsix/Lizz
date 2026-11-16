CREATE TABLE IF NOT EXISTS timetable_plans (
 id CHAR(36) PRIMARY KEY, section_id CHAR(36) NOT NULL UNIQUE,
 meetings_json JSON NOT NULL, exceptions_json JSON NOT NULL,
 reason VARCHAR(1000) NOT NULL, updated_by CHAR(36) NOT NULL,
 updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_tt_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
 CONSTRAINT fk_tt_actor FOREIGN KEY (updated_by) REFERENCES accounts(id),
 CONSTRAINT chk_tt_version CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE attendance_sessions
 ADD COLUMN lesson_key VARCHAR(40) NOT NULL DEFAULT 'legacy',
 ADD COLUMN lesson_start_time CHAR(5) NULL,
 ADD COLUMN lesson_end_time CHAR(5) NULL,
 ADD COLUMN lesson_room_id CHAR(36) NULL,
 ADD CONSTRAINT fk_att_lesson_room FOREIGN KEY (lesson_room_id) REFERENCES exam_rooms(id),
 ADD UNIQUE KEY uq_att_session_lesson (section_id,class_date,lesson_key),
 DROP INDEX uq_att_session_day;
