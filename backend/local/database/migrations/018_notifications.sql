CREATE TABLE notifications (
 id CHAR(36) PRIMARY KEY, event_id CHAR(36) NOT NULL,
 account_id CHAR(36) NOT NULL, recipient_role VARCHAR(20) NOT NULL,
 kind VARCHAR(20) NOT NULL, entity_id CHAR(36) NOT NULL, action VARCHAR(80) NOT NULL, payload_json JSON NULL,
 created_at BIGINT NOT NULL, read_at BIGINT NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_notice_event FOREIGN KEY(event_id) REFERENCES audit_events(id),
 CONSTRAINT fk_notice_account FOREIGN KEY(account_id) REFERENCES accounts(id),
 CONSTRAINT uq_notice_recipient UNIQUE(event_id, account_id),
 CONSTRAINT ck_notice_role CHECK(recipient_role IN ('MANAGER','STAFF','LECTURER','STUDENT')),
 CONSTRAINT ck_notice_version CHECK(version>0),
 INDEX ix_notice_inbox(account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
