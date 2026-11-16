CREATE TABLE IF NOT EXISTS curriculum_versions (
 id CHAR(36) PRIMARY KEY,
 code VARCHAR(40) NOT NULL, name VARCHAR(180) NOT NULL,
 edition INT NOT NULL, major_id CHAR(36) NOT NULL, cohort_id CHAR(36) NOT NULL,
 groups_json JSON NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
 updated_by CHAR(36) NOT NULL, updated_at BIGINT NOT NULL,
 published_by CHAR(36) NULL, published_at BIGINT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT uq_curriculum_edition UNIQUE(code,edition,major_id,cohort_id),
 CONSTRAINT fk_curriculum_major FOREIGN KEY(major_id) REFERENCES majors(id),
 CONSTRAINT fk_curriculum_cohort FOREIGN KEY(cohort_id) REFERENCES cohorts(id),
 CONSTRAINT fk_curriculum_updater FOREIGN KEY(updated_by) REFERENCES accounts(id),
 CONSTRAINT fk_curriculum_publisher FOREIGN KEY(published_by) REFERENCES accounts(id),
 CONSTRAINT chk_curriculum_edition CHECK(edition BETWEEN 1 AND 999),
 CONSTRAINT chk_curriculum_status CHECK(status IN ('DRAFT','PUBLISHED')),
 CONSTRAINT chk_curriculum_version CHECK(version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_curricula (
 id CHAR(36) PRIMARY KEY, curriculum_id CHAR(36) NOT NULL,
 student_id CHAR(36) NOT NULL UNIQUE, reason VARCHAR(1000) NOT NULL,
 created_by CHAR(36) NOT NULL, created_at BIGINT NOT NULL,
 request_hash CHAR(64) NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_student_curriculum_version FOREIGN KEY(curriculum_id) REFERENCES curriculum_versions(id),
 CONSTRAINT fk_student_curriculum_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_student_curriculum_actor FOREIGN KEY(created_by) REFERENCES accounts(id),
 CONSTRAINT chk_student_curriculum_version CHECK(version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
