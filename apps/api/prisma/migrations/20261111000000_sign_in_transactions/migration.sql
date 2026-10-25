CREATE TABLE `sign_in_transactions` (
  `handle_hash` CHAR(64) NOT NULL,
  `stage` VARCHAR(16) NOT NULL,
  `method_id` VARCHAR(136) NOT NULL,
  `factor_id` VARCHAR(136) NULL,
  `user_id` CHAR(36) NULL,
  `setup_token_hash` CHAR(64) NULL,
  `state` TEXT NOT NULL,
  `client_key` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`handle_hash`),
  INDEX `sign_in_transactions_user_id_idx` (`user_id`),
  INDEX `sign_in_transactions_client_key_idx` (`client_key`),
  INDEX `sign_in_transactions_expires_at_idx` (`expires_at`),
  CONSTRAINT `sign_in_transactions_user_id_fkey` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sign_in_transactions_state_check` CHECK (JSON_VALID(`state`) AND OCTET_LENGTH(`state`) <= 8192),
  CONSTRAINT `sign_in_transactions_stage_check` CHECK (`stage` IN ('primary', 'secondFactor', 'enroll', 'setup', 'account'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
