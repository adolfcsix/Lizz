ALTER TABLE accounts MODIFY role ENUM('ADMIN','TRAINING','MANAGER','STAFF','LECTURER','STUDENT') NOT NULL;
UPDATE accounts SET role = CASE role WHEN 'ADMIN' THEN 'MANAGER' WHEN 'TRAINING' THEN 'STAFF' ELSE role END, version = version + 1 WHERE role IN ('ADMIN','TRAINING');
ALTER TABLE accounts MODIFY role ENUM('MANAGER','STAFF','LECTURER','STUDENT') NOT NULL;

CREATE TABLE IF NOT EXISTS work_items (
 id CHAR(36) PRIMARY KEY,
 title VARCHAR(180) NOT NULL,
 assigned_to CHAR(36) NOT NULL,
 assigned_by CHAR(36) NOT NULL,
 due_date DATE NOT NULL,
 priority ENUM('NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
 status ENUM('NEW','IN_PROGRESS','WAITING','COMPLETED') NOT NULL DEFAULT 'NEW',
 notes TEXT NOT NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_work_assignee FOREIGN KEY (assigned_to) REFERENCES accounts(id),
 CONSTRAINT fk_work_assigner FOREIGN KEY (assigned_by) REFERENCES accounts(id),
 INDEX idx_work_assignee (assigned_to, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_requests (
 id CHAR(36) PRIMARY KEY,
 request_hash CHAR(64) NOT NULL,
 requested_by CHAR(36) NOT NULL,
 work_id CHAR(36) NULL,
 title VARCHAR(180) NOT NULL,
 payload_json JSON NOT NULL,
 preview_json JSON NOT NULL,
 status ENUM('PENDING','APPROVED','REJECTED','APPLIED') NOT NULL DEFAULT 'PENDING',
 decided_by CHAR(36) NULL,
 decision_reason TEXT NULL,
 result_json JSON NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_approval_requester FOREIGN KEY (requested_by) REFERENCES accounts(id),
 CONSTRAINT fk_approval_work FOREIGN KEY (work_id) REFERENCES work_items(id),
 CONSTRAINT fk_approval_decider FOREIGN KEY (decided_by) REFERENCES accounts(id),
 INDEX idx_approval_status (status, requested_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
