ALTER TABLE `content_paths`
  ADD COLUMN `was_public` BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE `content_tombstones`
  ADD COLUMN `was_public` BOOLEAN NOT NULL DEFAULT FALSE;

-- Only currently public paths can be established from the old schema.
-- Historical draft/trash paths and legacy tombstones remain unverified.
UPDATE `content_paths` p
JOIN `contents` c ON c.id = p.content_id
SET p.was_public = TRUE
WHERE c.status = 'published' AND c.trashed_at IS NULL;
