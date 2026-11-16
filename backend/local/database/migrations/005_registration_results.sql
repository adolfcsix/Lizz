CREATE TABLE IF NOT EXISTS academic_terms (
 id CHAR(36) PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(160) NOT NULL,
 max_credits INT NOT NULL,
 pass_score DECIMAL(4,2) NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT chk_term_credits CHECK (max_credits BETWEEN 1 AND 60),
 CONSTRAINT chk_term_pass CHECK (pass_score > 0 AND pass_score <= 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS registration_periods (
 id CHAR(36) PRIMARY KEY,
 term_id CHAR(36) NOT NULL,
 title VARCHAR(180) NOT NULL,
 opens_at BIGINT NOT NULL,
 closes_at BIGINT NOT NULL,
 withdraw_until BIGINT NOT NULL,
 status ENUM('OPEN','CLOSED') NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_period_term FOREIGN KEY (term_id) REFERENCES academic_terms(id),
 CONSTRAINT chk_period_range CHECK (opens_at < closes_at AND closes_at <= withdraw_until),
 INDEX idx_period_term (term_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS subject_requirements (
 id CHAR(36) PRIMARY KEY,
 subject_id CHAR(36) NOT NULL,
 required_subject_id CHAR(36) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 version INT NOT NULL DEFAULT 1,
 UNIQUE KEY uq_subject_requirement (subject_id,required_subject_id),
 CONSTRAINT fk_requirement_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
 CONSTRAINT fk_requirement_required FOREIGN KEY (required_subject_id) REFERENCES subjects(id),
 CONSTRAINT chk_requirement_self CHECK (subject_id <> required_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grade_records (
 id CHAR(36) PRIMARY KEY,
 enrollment_id CHAR(36) NOT NULL UNIQUE,
 enrollment_version INT NOT NULL,
 score DECIMAL(4,2) NOT NULL,
 status ENUM('DRAFT','SUBMITTED','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
 entered_by CHAR(36) NOT NULL,
 published_by CHAR(36) NULL,
 published_at BIGINT NULL,
 pass_score DECIMAL(4,2) NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_grade_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
 CONSTRAINT fk_grade_author FOREIGN KEY (entered_by) REFERENCES accounts(id),
 CONSTRAINT fk_grade_publisher FOREIGN KEY (published_by) REFERENCES accounts(id),
 CONSTRAINT chk_grade_enrollment_version CHECK (enrollment_version > 0),
 CONSTRAINT chk_grade_score CHECK (score BETWEEN 0 AND 10),
 CONSTRAINT chk_grade_publication CHECK (status <> 'PUBLISHED' OR (published_by IS NOT NULL AND published_at IS NOT NULL AND pass_score IS NOT NULL AND pass_score > 0 AND pass_score <= 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
