-- Exact-byte current routes and redirect history. Existing /slug routes are preserved,
-- including legacy slugs now reserved for new routes.
CREATE TABLE `content_paths` (
    `path_hash` BINARY(32) NOT NULL,
    `path` VARBINARY(4096) NOT NULL,
    `content_id` CHAR(36) NOT NULL,
    `current_for` CHAR(36) NULL,

    PRIMARY KEY (`path_hash`),
    UNIQUE INDEX `content_paths_current_for_key` (`current_for`),
    INDEX `content_paths_content_id_idx` (`content_id`),
    CONSTRAINT `content_paths_current_owner_check`
        CHECK (`current_for` IS NULL OR `current_for` = `content_id`),
    CONSTRAINT `content_paths_content_id_fkey`
        FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT `content_paths_current_for_fkey`
        FOREIGN KEY (`current_for`) REFERENCES `contents` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `content_paths` (`path_hash`, `path`, `content_id`, `current_for`)
SELECT UNHEX(SHA2(CONCAT('/', `slug`), 256)), CAST(CONCAT('/', `slug`) AS BINARY), `id`, `id`
FROM `contents`;

-- Future unpublishing retains published_at. Earlier erased publication dates/history cannot
-- be reconstructed; existing never-published/undated rows use created_at for date templates.
