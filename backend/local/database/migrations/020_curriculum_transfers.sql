CREATE TABLE curriculum_transfer_requests (
 id CHAR(36) PRIMARY KEY, student_id CHAR(36) NOT NULL,
 requested_by CHAR(36) NOT NULL, request_hash CHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL, payload_json JSON NOT NULL, preview_json JSON NOT NULL,
 decided_by CHAR(36) NULL, decision_reason VARCHAR(1000) NULL, result_json JSON NULL,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_ct_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_ct_requester FOREIGN KEY(requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_ct_decider FOREIGN KEY(decided_by) REFERENCES accounts(id),
 CONSTRAINT ck_ct_status CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED','APPLIED')),
 CONSTRAINT ck_ct_version CHECK(version>0),
 INDEX ix_ct_student_status(student_id,status), INDEX ix_ct_requester(requested_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
