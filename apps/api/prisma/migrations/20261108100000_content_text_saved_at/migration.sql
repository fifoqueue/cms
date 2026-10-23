ALTER TABLE `contents` ADD COLUMN `text_saved_at` DATETIME(3) NULL;

UPDATE `contents` AS c
LEFT JOIN (
  SELECT `content_id`, MAX(`created_at`) AS `saved_at`
  FROM `content_revisions`
  WHERE `kind` = 'revision'
  GROUP BY `content_id`
) AS r ON r.`content_id` = c.`id`
SET c.`text_saved_at` = COALESCE(r.`saved_at`, c.`updated_at`);

ALTER TABLE `contents` MODIFY COLUMN `text_saved_at` DATETIME(3) NOT NULL;
