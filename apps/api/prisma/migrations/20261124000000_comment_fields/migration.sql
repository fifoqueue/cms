-- Custom field values per comment; existing comments start without values.
-- AlterTable
ALTER TABLE `comments` ADD COLUMN `fields` LONGTEXT NOT NULL DEFAULT '{}';
