-- Issue time of each session, for the user's own sessions list. Existing sessions get the
-- migration time; nothing else changes.
ALTER TABLE `sessions` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
