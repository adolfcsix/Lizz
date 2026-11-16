CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  role ENUM('ADMIN','TRAINING','LECTURER','STUDENT') NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  account_version INT NOT NULL,
  account_id CHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  CONSTRAINT fk_session_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  INDEX idx_session_account (account_id),
  INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cohorts (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  start_year INT NOT NULL UNIQUE,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT chk_cohort_year CHECK (start_year BETWEEN 1900 AND 2200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS faculties (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  version INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS majors (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  faculty_id CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_major_faculty FOREIGN KEY (faculty_id) REFERENCES faculties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  major_id CHAR(36) NOT NULL,
  cohort_id CHAR(36) NOT NULL,
  capacity INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_class_major FOREIGN KEY (major_id) REFERENCES majors(id),
  CONSTRAINT fk_class_cohort FOREIGN KEY (cohort_id) REFERENCES cohorts(id),
  CONSTRAINT chk_class_capacity CHECK (capacity BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_profiles (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  class_id CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_student_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_student_class FOREIGN KEY (class_id) REFERENCES classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_batches (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_batch_actor FOREIGN KEY (actor_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  detail_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES accounts(id),
  INDEX idx_audit_entity (entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
