CREATE TABLE curriculum_assignment_batches (
 id CHAR(36) PRIMARY KEY,
 actor_id CHAR(36) NOT NULL,
 curriculum_id CHAR(36) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 staff_scope_token CHAR(64) NULL,
 result_json JSON NOT NULL,
 created_at BIGINT NOT NULL,
 CONSTRAINT fk_curriculum_batch_actor FOREIGN KEY(actor_id) REFERENCES accounts(id),
 CONSTRAINT fk_curriculum_batch_program FOREIGN KEY(curriculum_id) REFERENCES curriculum_versions(id),
 INDEX ix_curriculum_batch_actor(actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
