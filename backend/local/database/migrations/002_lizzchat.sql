CREATE TABLE IF NOT EXISTS ai_conversations (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  account_version INT NOT NULL,
  messages_json JSON NOT NULL,
  history_json JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ai_conversation_actor FOREIGN KEY (actor_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_proposals (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  account_version INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  preview_json JSON NOT NULL,
  context_hash CHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  status ENUM('PREPARED','EXECUTED','CANCELLED','EXPIRED','STALE') NOT NULL,
  result_json JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ai_proposal_actor FOREIGN KEY (actor_id) REFERENCES accounts(id),
  CONSTRAINT fk_ai_proposal_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id),
  INDEX idx_ai_proposal_owner (actor_id, conversation_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
