-- AlterTable
ALTER TABLE `contents` ADD COLUMN `seo_max_image_preview` VARCHAR(16) NULL,
    ADD COLUMN `seo_max_snippet` INTEGER NULL,
    ADD COLUMN `seo_no_snippet` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `taxonomy_terms` ADD COLUMN `seo_max_image_preview` VARCHAR(16) NULL,
    ADD COLUMN `seo_max_snippet` INTEGER NULL,
    ADD COLUMN `seo_no_snippet` BOOLEAN NOT NULL DEFAULT false;
