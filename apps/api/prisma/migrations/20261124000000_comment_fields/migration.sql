-- Custom field values per comment (WordPress comment meta); existing comments start without values.
-- AlterTable
ALTER TABLE `comments` ADD COLUMN `fields` LONGTEXT NOT NULL DEFAULT '{}';
