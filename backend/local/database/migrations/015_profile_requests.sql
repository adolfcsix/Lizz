ALTER TABLE student_profiles ADD COLUMN contact_details_json JSON NULL;

CREATE TABLE IF NOT EXISTS profile_change_requests (
 id CHAR(36) PRIMARY KEY, student_id CHAR(36) NOT NULL,
 requested_by CHAR(36) NOT NULL, assigned_to CHAR(36) NULL,
 base_profile_version INT NOT NULL, before_contact_json JSON NOT NULL,
 proposed_contact_json JSON NOT NULL, status VARCHAR(20) NOT NULL,
 reason VARCHAR(1000) NOT NULL, review_history_json JSON NOT NULL,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 updated_by CHAR(36) NOT NULL, request_hash CHAR(64) NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_profile_change_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_profile_change_requester FOREIGN KEY(requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_profile_change_assignee FOREIGN KEY(assigned_to) REFERENCES accounts(id),
 CONSTRAINT fk_profile_change_updater FOREIGN KEY(updated_by) REFERENCES accounts(id),
 CONSTRAINT chk_profile_change_status CHECK(status IN ('SUBMITTED','IN_REVIEW','NEEDS_INFO','RECOMMENDED','APPLIED','REJECTED','CANCELLED')),
 CONSTRAINT chk_profile_change_version CHECK(version>0 AND base_profile_version>0),
 INDEX idx_profile_change_queue(status,assigned_to,updated_at),
 INDEX idx_profile_change_student(student_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
