CREATE TABLE student_service_definitions (
 id CHAR(36) PRIMARY KEY, code VARCHAR(40) NOT NULL, edition INT NOT NULL,
 name VARCHAR(180) NOT NULL, status VARCHAR(20) NOT NULL,
 payload_json JSON NOT NULL, updated_by CHAR(36) NOT NULL, updated_at BIGINT NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT uq_ssd_edition UNIQUE(code,edition),
 CONSTRAINT fk_ssd_editor FOREIGN KEY(updated_by) REFERENCES accounts(id),
 CONSTRAINT ck_ssd_status CHECK(status IN ('DRAFT','PUBLISHED','CLOSED')),
 CONSTRAINT ck_ssd_edition CHECK(edition BETWEEN 1 AND 999),
 CONSTRAINT ck_ssd_version CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_service_requests (
 id CHAR(36) PRIMARY KEY, student_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL,
 requested_by CHAR(36) NOT NULL, assigned_to CHAR(36) NULL, charge_id CHAR(36) NULL,
 request_hash CHAR(64) NOT NULL, status VARCHAR(20) NOT NULL,
 payload_json JSON NOT NULL, result_json JSON NULL, history_json JSON NOT NULL,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_ssr_student FOREIGN KEY(student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_ssr_service FOREIGN KEY(service_id) REFERENCES student_service_definitions(id),
 CONSTRAINT fk_ssr_requester FOREIGN KEY(requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_ssr_assignee FOREIGN KEY(assigned_to) REFERENCES accounts(id),
 CONSTRAINT fk_ssr_charge FOREIGN KEY(charge_id) REFERENCES student_charges(id),
 CONSTRAINT ck_ssr_status CHECK(status IN ('DRAFT','SUBMITTED','IN_PROGRESS','NEEDS_INFO','READY','DELIVERED','REJECTED','CANCELLED')),
 CONSTRAINT ck_ssr_version CHECK(version>0),
 INDEX ix_ssr_student(student_id,status), INDEX ix_ssr_assignee(assigned_to,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
