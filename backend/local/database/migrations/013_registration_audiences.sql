ALTER TABLE registration_periods
 ADD COLUMN faculty_id CHAR(36) NULL,
 ADD COLUMN cohort_id CHAR(36) NULL,
 ADD CONSTRAINT fk_reg_period_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id),
 ADD CONSTRAINT fk_reg_period_cohort FOREIGN KEY (cohort_id) REFERENCES cohorts(id),
 ADD INDEX idx_reg_period_audience (term_id,faculty_id,cohort_id,status);

ALTER TABLE enrollments
 ADD COLUMN registration_period_id CHAR(36) NULL,
 ADD COLUMN registration_period_version INT NULL,
 ADD COLUMN withdrawal_deadline BIGINT NULL,
 ADD CONSTRAINT fk_enrollment_period FOREIGN KEY (registration_period_id) REFERENCES registration_periods(id),
 ADD CONSTRAINT chk_enrollment_period_version CHECK (registration_period_version IS NULL OR registration_period_version > 0),
 ADD INDEX idx_enrollment_period (registration_period_id);
