CREATE TABLE `passkeys` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `credential_id` VARBINARY(1024) NOT NULL,
  `public_key` BLOB NOT NULL,
  `counter` BIGINT UNSIGNED NOT NULL,
  `transports` TEXT NOT NULL,
  `device_type` VARCHAR(32) NOT NULL,
  `backed_up` BOOLEAN NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `passkeys_credential_id_key` (`credential_id`),
  INDEX `passkeys_user_id_idx` (`user_id`),
  CONSTRAINT `passkeys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `totp_secrets` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `sealed_secret` TEXT NOT NULL,
  `last_step` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `totp_secrets_user_id_key` (`user_id`),
  CONSTRAINT `totp_secrets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
