CREATE TABLE IF NOT EXISTS subjects (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  credits INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT chk_subject_credits CHECK (credits BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_sections (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  subject_id CHAR(36) NOT NULL,
  lecturer_id CHAR(36) NOT NULL,
  term VARCHAR(40) NOT NULL,
  capacity INT NOT NULL,
  start_date CHAR(10) NOT NULL,
  end_date CHAR(10) NOT NULL,
  weekday INT NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_section_term_code (term,code),
  CONSTRAINT fk_section_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_section_lecturer FOREIGN KEY (lecturer_id) REFERENCES accounts(id),
  CONSTRAINT chk_section_capacity CHECK (capacity BETWEEN 1 AND 1000),
  CONSTRAINT chk_section_day CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_section_range CHECK (end_date >= start_date AND end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enrollments (
  id CHAR(36) PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  status ENUM('ACTIVE','WITHDRAWN') NOT NULL,
  version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_enrollment_student_section (student_id,section_id),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
  CONSTRAINT fk_enrollment_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
  INDEX idx_enrollment_section (section_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_requests (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_academic_request_actor FOREIGN KEY (actor_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
