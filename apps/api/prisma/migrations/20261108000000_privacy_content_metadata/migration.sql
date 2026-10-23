ALTER TABLE contents ADD COLUMN menu_order INT NOT NULL DEFAULT 0;
ALTER TABLE media ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '', ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN expires_at DATETIME(3) NULL;
CREATE TABLE privacy_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  action VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  token_hash CHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  UNIQUE INDEX privacy_requests_token_hash_key (token_hash),
  INDEX privacy_requests_action_created_at_idx (action, created_at),
  INDEX privacy_requests_email_idx (email)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
