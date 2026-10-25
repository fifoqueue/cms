ALTER TABLE `sign_in_transactions`
    ADD COLUMN `in_progress` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `sign_in_transactions`
    ADD COLUMN `identity_id` CHAR(36) NULL,
    ADD INDEX `sign_in_transactions_identity_id_idx` (`identity_id`),
    ADD CONSTRAINT `sign_in_transactions_identity_id_fkey`
      FOREIGN KEY (`identity_id`) REFERENCES `user_identities` (`id`)
      ON DELETE CASCADE ON UPDATE CASCADE;
