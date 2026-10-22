-- Custom content types (type becomes a free key) and custom field values per entry.
-- AlterTable
ALTER TABLE `contents` ADD COLUMN `fields` LONGTEXT NOT NULL DEFAULT '{}',
    MODIFY `type` VARCHAR(32) NOT NULL;

