CREATE TABLE IF NOT EXISTS grade_schemes (
 id CHAR(36) PRIMARY KEY, section_id CHAR(36) NOT NULL UNIQUE,
 components_json JSON NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_grade_scheme_section FOREIGN KEY (section_id) REFERENCES course_sections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gpa_policies (
 id CHAR(36) PRIMARY KEY, term_id CHAR(36) NOT NULL UNIQUE,
 bands_json JSON NOT NULL, repeat_rule ENUM('LATEST','HIGHEST') NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_gpa_policy_term FOREIGN KEY (term_id) REFERENCES academic_terms(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE grade_records
 ADD COLUMN component_scores_json JSON NULL,
 ADD COLUMN scheme_version INT NULL,
 ADD COLUMN result_snapshot_json JSON NULL;
