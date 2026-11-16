CREATE TABLE exam_seating_plans (
 id CHAR(36) PRIMARY KEY,
 exam_id CHAR(36) NOT NULL,
 payload_json JSON NOT NULL,
 version INT NOT NULL,
 created_by CHAR(36) NOT NULL,
 created_at BIGINT NOT NULL,
 CONSTRAINT fk_esp_exam FOREIGN KEY(exam_id) REFERENCES exam_schedules(id),
 CONSTRAINT fk_esp_actor FOREIGN KEY(created_by) REFERENCES accounts(id),
 CONSTRAINT ck_esp_revision CHECK(version>0),
 UNIQUE KEY uq_esp_revision (exam_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
