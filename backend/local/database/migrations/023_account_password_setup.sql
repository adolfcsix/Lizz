ALTER TABLE accounts
 ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
 ADD CONSTRAINT ck_accounts_password_setup CHECK (must_change_password IN (0,1));
