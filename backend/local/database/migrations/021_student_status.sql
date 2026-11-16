CREATE TABLE student_status_requests (
 id CHAR(36) PRIMARY KEY, student_id CHAR(36) NOT NULL, term_id CHAR(36) NOT NULL,
 kind VARCHAR(20) NOT NULL, requested_by CHAR(36) NOT NULL, request_hash CHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL, payload_json JSON NOT NULL, preview_json JSON NOT NULL,
 reviewed_by CHAR(36) NULL, decided_by CHAR(36) NULL, decision_reason VARCHAR(1000) NULL,
 result_json JSON NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_ss_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_ss_term FOREIGN KEY(term_id) REFERENCES academic_terms(id),
 CONSTRAINT fk_ss_requester FOREIGN KEY(requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_ss_reviewer FOREIGN KEY(reviewed_by) REFERENCES accounts(id),
 CONSTRAINT fk_ss_decider FOREIGN KEY(decided_by) REFERENCES accounts(id),
 CONSTRAINT ck_ss_kind CHECK(kind IN ('LEAVE','RETURN')),
 CONSTRAINT ck_ss_status CHECK(status IN ('SUBMITTED','REVIEWED','APPROVED','APPLIED','REJECTED','CANCELLED')),
 CONSTRAINT ck_ss_version CHECK(version>0),
 INDEX ix_ss_student_status(student_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
