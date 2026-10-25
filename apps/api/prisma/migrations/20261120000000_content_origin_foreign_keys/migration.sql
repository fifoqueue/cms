-- Scrub dangling provenance before adding constraints to already deployed columns.
UPDATE `contents` c LEFT JOIN `users` u ON u.id = c.created_by_id
SET c.created_by_id = NULL, c.created_ip = NULL, c.created_user_agent = NULL
WHERE c.created_by_id IS NOT NULL AND u.id IS NULL;

UPDATE `contents` c LEFT JOIN `users` u ON u.id = c.modified_by_id
SET c.modified_by_id = NULL, c.modified_ip = NULL, c.modified_user_agent = NULL
WHERE c.modified_by_id IS NOT NULL AND u.id IS NULL;

ALTER TABLE `contents`
  ADD CONSTRAINT `contents_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `contents_modified_by_id_fkey` FOREIGN KEY (`modified_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
