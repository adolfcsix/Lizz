CREATE TABLE IF NOT EXISTS grade_review_periods (
 id CHAR(36) PRIMARY KEY, term_id CHAR(36) NOT NULL UNIQUE,
 opens_at BIGINT NOT NULL, closes_at BIGINT NOT NULL, active BOOLEAN NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_gr_period_term FOREIGN KEY (term_id) REFERENCES academic_terms(id),
 CONSTRAINT chk_gr_period_range CHECK (opens_at < closes_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grade_review_requests (
 id CHAR(36) PRIMARY KEY, grade_id CHAR(36) NOT NULL, student_id CHAR(36) NOT NULL, section_id CHAR(36) NOT NULL,
 requested_by CHAR(36) NOT NULL, request_kind ENUM('APPEAL','CORRECTION') NOT NULL,
 status ENUM('REQUESTED','PROPOSED','APPROVED','APPLIED','REJECTED','CANCELLED') NOT NULL,
 reason VARCHAR(2000) NOT NULL, base_grade_version INT NOT NULL, base_grade_json JSON NOT NULL,
 proposal_json JSON NULL, proposed_by CHAR(36) NULL, approved_by CHAR(36) NULL, approval_hash VARCHAR(64) NULL,
 review_history_json JSON NOT NULL, created_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 active_grade_id CHAR(36) GENERATED ALWAYS AS (CASE WHEN status IN ('REQUESTED','PROPOSED','APPROVED') THEN grade_id ELSE NULL END) STORED,
 UNIQUE KEY uq_gr_active_grade (active_grade_id),
 CONSTRAINT fk_gr_grade FOREIGN KEY (grade_id) REFERENCES grade_records(id),
 CONSTRAINT fk_gr_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_gr_section FOREIGN KEY (section_id) REFERENCES course_sections(id),
 CONSTRAINT fk_gr_requester FOREIGN KEY (requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_gr_proposer FOREIGN KEY (proposed_by) REFERENCES accounts(id),
 CONSTRAINT fk_gr_approver FOREIGN KEY (approved_by) REFERENCES accounts(id),
 CONSTRAINT chk_gr_base_version CHECK (base_grade_version > 0),
 CONSTRAINT chk_gr_proposal CHECK (status NOT IN ('PROPOSED','APPROVED','APPLIED') OR (proposal_json IS NOT NULL AND proposed_by IS NOT NULL)),
 CONSTRAINT chk_gr_approval CHECK (status NOT IN ('APPROVED','APPLIED') OR (approved_by IS NOT NULL AND approval_hash IS NOT NULL)),
 INDEX idx_gr_student_status (student_id,status), INDEX idx_gr_section (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grade_revisions (
 id CHAR(36) PRIMARY KEY, review_id CHAR(36) NOT NULL UNIQUE, grade_id CHAR(36) NOT NULL, student_id CHAR(36) NOT NULL,
 before_grade_json JSON NOT NULL, after_grade_json JSON NOT NULL,
 applied_by CHAR(36) NOT NULL, applied_at BIGINT NOT NULL, reason VARCHAR(2000) NOT NULL,
 CONSTRAINT fk_gr_revision_review FOREIGN KEY (review_id) REFERENCES grade_review_requests(id),
 CONSTRAINT fk_gr_revision_grade FOREIGN KEY (grade_id) REFERENCES grade_records(id),
 CONSTRAINT fk_gr_revision_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_gr_revision_actor FOREIGN KEY (applied_by) REFERENCES accounts(id),
 INDEX idx_gr_revision_grade (grade_id,applied_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
