ALTER TABLE `contents`
  ADD COLUMN `created_by_id` CHAR(36) NULL,
  ADD COLUMN `modified_by_id` CHAR(36) NULL;
