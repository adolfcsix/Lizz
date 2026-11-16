CREATE TABLE credit_recognition_requests (
 id CHAR(36) PRIMARY KEY, student_id CHAR(36) NOT NULL, subject_id CHAR(36) NOT NULL,
 requested_by CHAR(36) NOT NULL, request_hash CHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL, payload_json JSON NOT NULL,
 decided_by CHAR(36) NULL, decision_reason VARCHAR(1000) NULL, result_json JSON NULL,
 history_json JSON NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_cr_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_cr_subject FOREIGN KEY(subject_id) REFERENCES subjects(id),
 CONSTRAINT fk_cr_requester FOREIGN KEY(requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_cr_decider FOREIGN KEY(decided_by) REFERENCES accounts(id),
 CONSTRAINT ck_cr_status CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED','APPLIED','REVOKED')),
 CONSTRAINT ck_cr_version CHECK(version>0), INDEX ix_cr_student_subject(student_id,subject_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
