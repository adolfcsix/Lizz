CREATE TABLE academic_standing_policies (
 id CHAR(36) PRIMARY KEY, term_id CHAR(36) NOT NULL UNIQUE,
 payload_json JSON NOT NULL, reason VARCHAR(1000) NOT NULL,
 updated_by CHAR(36) NOT NULL, updated_at BIGINT NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_asp_term FOREIGN KEY(term_id) REFERENCES academic_terms(id),
 CONSTRAINT fk_asp_actor FOREIGN KEY(updated_by) REFERENCES accounts(id),
 CONSTRAINT ck_asp_version CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
