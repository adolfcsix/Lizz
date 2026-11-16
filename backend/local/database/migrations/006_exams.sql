CREATE TABLE IF NOT EXISTS exam_rooms (
 id CHAR(36) PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(160) NOT NULL,
 capacity INT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT chk_exam_room_capacity CHECK (capacity BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS exam_schedules (
 id CHAR(36) PRIMARY KEY,
 section_id CHAR(36) NOT NULL,
 room_id CHAR(36) NOT NULL,
 invigilator_id CHAR(36) NOT NULL,
 exam_date DATE NOT NULL,
 start_time CHAR(5) NOT NULL,
 end_time CHAR(5) NOT NULL,
 status ENUM('DRAFT','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 published_by CHAR(36) NULL,
 published_at BIGINT NULL,
 review_hash CHAR(64) NULL,
 cancelled_by CHAR(36) NULL,
 cancel_reason VARCHAR(1000) NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_exam_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
 CONSTRAINT fk_exam_room FOREIGN KEY (room_id) REFERENCES exam_rooms(id),
 CONSTRAINT fk_exam_invigilator FOREIGN KEY (invigilator_id) REFERENCES accounts(id),
 CONSTRAINT fk_exam_publisher FOREIGN KEY (published_by) REFERENCES accounts(id),
 CONSTRAINT fk_exam_canceller FOREIGN KEY (cancelled_by) REFERENCES accounts(id),
 CONSTRAINT chk_exam_time CHECK (start_time < end_time),
 INDEX idx_exam_date (exam_date,status),
 INDEX idx_exam_room (room_id,exam_date),
 INDEX idx_exam_section (section_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
