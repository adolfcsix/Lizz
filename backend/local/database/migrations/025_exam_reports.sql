CREATE TABLE exam_reports (
 id CHAR(36) PRIMARY KEY,
 exam_id CHAR(36) NOT NULL,
 status ENUM('DRAFT','SUBMITTED','CONFIRMED','RETURNED') NOT NULL,
 payload_json JSON NOT NULL,
 version INT NOT NULL,
 created_by CHAR(36) NOT NULL,
 created_at BIGINT NOT NULL,
 CONSTRAINT fk_er_exam FOREIGN KEY(exam_id) REFERENCES exam_schedules(id),
 CONSTRAINT fk_er_actor FOREIGN KEY(created_by) REFERENCES accounts(id),
 CONSTRAINT ck_er_version CHECK(version>0),
 UNIQUE KEY uq_er_revision (exam_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
