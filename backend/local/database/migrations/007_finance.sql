CREATE TABLE IF NOT EXISTS student_charges (
 id CHAR(36) PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
 student_id CHAR(36) NOT NULL, term VARCHAR(40) NOT NULL, title VARCHAR(180) NOT NULL,
 amount DECIMAL(12,0) NOT NULL, due_date DATE NOT NULL,
 status ENUM('DRAFT','ISSUED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 issued_by CHAR(36) NULL, issued_at BIGINT NULL, reason VARCHAR(1000) NULL,
 version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_charge_student FOREIGN KEY (student_id) REFERENCES student_profiles(id),
 CONSTRAINT fk_charge_term FOREIGN KEY (term) REFERENCES academic_terms(code),
 CONSTRAINT fk_charge_issuer FOREIGN KEY (issued_by) REFERENCES accounts(id),
 CONSTRAINT chk_charge_amount CHECK (amount > 0 AND amount <= 2000000000),
 INDEX idx_charge_student_term (student_id,term,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payment_receipts (
 id CHAR(36) PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
 charge_id CHAR(36) NOT NULL, amount DECIMAL(12,0) NOT NULL,
 method ENUM('CASH','TRANSFER') NOT NULL, reference VARCHAR(100) NULL,
 status ENUM('PENDING','CONFIRMED','REJECTED','REVERSED') NOT NULL DEFAULT 'PENDING',
 reported_at BIGINT NOT NULL, created_by CHAR(36) NOT NULL, confirmed_by CHAR(36) NULL, confirmed_at BIGINT NULL,
 reason VARCHAR(1000) NULL, version INT NOT NULL DEFAULT 1,
 CONSTRAINT fk_receipt_charge FOREIGN KEY (charge_id) REFERENCES student_charges(id),
 CONSTRAINT fk_receipt_creator FOREIGN KEY (created_by) REFERENCES accounts(id),
 CONSTRAINT fk_receipt_confirmer FOREIGN KEY (confirmed_by) REFERENCES accounts(id),
 CONSTRAINT chk_receipt_reference CHECK ((method='CASH' AND reference IS NULL) OR (method='TRANSFER' AND reference IS NOT NULL AND CHAR_LENGTH(reference)>0)),
 CONSTRAINT chk_receipt_confirmed CHECK (status<>'CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
 CONSTRAINT chk_receipt_amount CHECK (amount > 0 AND amount <= 2000000000),
 UNIQUE KEY uq_receipt_reference (method,reference),
 INDEX idx_receipt_charge (charge_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS charge_adjustments (
 id CHAR(36) PRIMARY KEY, charge_id CHAR(36) NOT NULL,
 delta DECIMAL(12,0) NOT NULL, reason VARCHAR(1000) NOT NULL, actor_id CHAR(36) NOT NULL,
 CONSTRAINT fk_adjustment_charge FOREIGN KEY (charge_id) REFERENCES student_charges(id),
 CONSTRAINT fk_adjustment_actor FOREIGN KEY (actor_id) REFERENCES accounts(id),
 CONSTRAINT chk_adjustment_delta CHECK (delta <> 0 AND delta BETWEEN -2000000000 AND 2000000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
