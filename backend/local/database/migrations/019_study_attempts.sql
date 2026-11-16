CREATE TABLE study_attempt_policies (
 id CHAR(36) PRIMARY KEY, term_id CHAR(36) NOT NULL UNIQUE,
 allow_retake BOOLEAN NOT NULL, allow_improvement BOOLEAN NOT NULL,
 max_attempts INT NOT NULL, max_improvement_score DECIMAL(4,2) NOT NULL,
 reason VARCHAR(1000) NOT NULL, updated_by CHAR(36) NOT NULL,
 updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_study_policy_term FOREIGN KEY(term_id) REFERENCES academic_terms(id),
 CONSTRAINT fk_study_policy_actor FOREIGN KEY(updated_by) REFERENCES accounts(id),
 CONSTRAINT ck_study_attempt_limit CHECK(max_attempts BETWEEN 1 AND 20),
 CONSTRAINT ck_study_improvement_score CHECK(max_improvement_score BETWEEN 0 AND 10),
 CONSTRAINT ck_study_policy_version CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE enrollments
 ADD COLUMN study_mode VARCHAR(20) NULL,
 ADD COLUMN study_snapshot_json JSON NULL,
 ADD CONSTRAINT ck_enrollment_study_mode CHECK(study_mode IS NULL OR study_mode IN ('FIRST','RETAKE','IMPROVEMENT','UNVERIFIED'));
