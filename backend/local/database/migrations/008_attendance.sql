CREATE TABLE IF NOT EXISTS attendance_policies (
 id CHAR(36) PRIMARY KEY, section_id CHAR(36) NOT NULL UNIQUE,
 expected_sessions INT NOT NULL, min_attendance_percent INT NOT NULL,
 late_present BOOLEAN NOT NULL, excused_present BOOLEAN NOT NULL,
 require_finance_clearance BOOLEAN NOT NULL, enforce_for_exams BOOLEAN NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_att_policy_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
 CONSTRAINT chk_att_policy_sessions CHECK (expected_sessions BETWEEN 1 AND 200),
 CONSTRAINT chk_att_policy_percent CHECK (min_attendance_percent BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS attendance_sessions (
 id CHAR(36) PRIMARY KEY, section_id CHAR(36) NOT NULL, exam_id CHAR(36) NULL,
 kind ENUM('CLASS','EXAM') NOT NULL, session_date DATE NOT NULL,
 status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN', roster_json JSON NOT NULL,
 closed_by CHAR(36) NULL, closed_at BIGINT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_att_session_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
 CONSTRAINT fk_att_session_exam FOREIGN KEY (exam_id) REFERENCES exam_schedules(id),
 CONSTRAINT fk_att_session_closer FOREIGN KEY (closed_by) REFERENCES accounts(id),
 CONSTRAINT chk_att_session_closed CHECK (status<>'CLOSED' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL)),
 CONSTRAINT chk_att_session_kind CHECK ((kind='CLASS' AND exam_id IS NULL) OR (kind='EXAM' AND exam_id IS NOT NULL)),
 class_date DATE GENERATED ALWAYS AS (CASE WHEN kind='CLASS' THEN session_date ELSE NULL END) STORED,
 UNIQUE KEY uq_att_session_day (section_id,class_date),
 UNIQUE KEY uq_att_session_exam (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS attendance_marks (
 id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL, student_id CHAR(36) NOT NULL,
 enrollment_id CHAR(36) NOT NULL, enrollment_version INT NOT NULL,
 status ENUM('PRESENT','LATE','EXCUSED','ABSENT') NOT NULL,
 reason VARCHAR(1000) NOT NULL DEFAULT '', entered_by CHAR(36) NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_att_mark_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
 CONSTRAINT fk_att_mark_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_att_mark_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
 CONSTRAINT fk_att_mark_entered FOREIGN KEY (entered_by) REFERENCES accounts(id),
 UNIQUE KEY uq_att_session_student (session_id,student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
