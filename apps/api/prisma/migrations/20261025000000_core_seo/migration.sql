-- Additive MariaDB migration. Existing entries retain empty/default SEO.
ALTER TABLE `contents`
    MODIFY `type` ENUM('post', 'page', 'article') NOT NULL,
    ADD COLUMN `seo_title` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_description` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_canonical_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_no_index` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `seo_no_follow` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `seo_image_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_image_alt` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_social_title` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_social_description` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_schema_type` VARCHAR(32) NOT NULL DEFAULT 'auto',
    ADD COLUMN `seo_author_name` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_author_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_focus_keyword` TEXT NOT NULL DEFAULT '',
    ADD INDEX `contents_status_seo_no_index_slug_idx` (`status`, `seo_no_index`, `slug`);

ALTER TABLE `taxonomy_terms`
    ADD COLUMN `seo_title` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_description` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_canonical_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_no_index` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `seo_no_follow` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `seo_image_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_image_alt` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_social_title` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_social_description` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_schema_type` VARCHAR(32) NOT NULL DEFAULT 'auto',
    ADD COLUMN `seo_author_name` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_author_url` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `seo_focus_keyword` TEXT NOT NULL DEFAULT '',
    ADD INDEX `taxonomy_terms_taxonomy_seo_no_index_slug_idx` (`taxonomy`, `seo_no_index`, `slug`);
