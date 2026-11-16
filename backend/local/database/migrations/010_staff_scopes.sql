CREATE TABLE IF NOT EXISTS staff_access_scopes (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL,
 scope_type ENUM('ALL','FACULTY') NOT NULL, faculty_id CHAR(36) NULL, cohort_id CHAR(36) NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_staff_scope_account FOREIGN KEY (account_id) REFERENCES accounts(id),
 CONSTRAINT fk_staff_scope_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
 CONSTRAINT fk_staff_scope_cohort FOREIGN KEY (cohort_id) REFERENCES cohorts(id),
 CONSTRAINT chk_staff_scope_type CHECK ((scope_type='ALL' AND faculty_id IS NULL AND cohort_id IS NULL) OR (scope_type='FACULTY' AND faculty_id IS NOT NULL)),
 INDEX idx_staff_scope_account (account_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO staff_access_scopes (id,account_id,scope_type,faculty_id,cohort_id,active,version)
 SELECT UUID(),a.id,'ALL',NULL,NULL,TRUE,1 FROM accounts a WHERE a.role='STAFF'
 AND NOT EXISTS (SELECT 1 FROM staff_access_scopes s WHERE s.account_id=a.id);
ALTER TABLE accounts
 ADD COLUMN affiliation_faculty_id CHAR(36) NULL,
 ADD COLUMN affiliation_cohort_id CHAR(36) NULL,
 ADD CONSTRAINT fk_account_affiliation_faculty FOREIGN KEY (affiliation_faculty_id) REFERENCES faculties(id),
 ADD CONSTRAINT fk_account_affiliation_cohort FOREIGN KEY (affiliation_cohort_id) REFERENCES cohorts(id);
ALTER TABLE course_sections
 ADD COLUMN faculty_id CHAR(36) NULL,
 ADD COLUMN cohort_id CHAR(36) NULL,
 ADD CONSTRAINT fk_section_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
 ADD CONSTRAINT fk_section_cohort FOREIGN KEY (cohort_id) REFERENCES cohorts(id);
ALTER TABLE academic_requests ADD COLUMN staff_scope_token VARCHAR(64) NULL;
ALTER TABLE import_batches ADD COLUMN staff_scope_token VARCHAR(64) NULL;
