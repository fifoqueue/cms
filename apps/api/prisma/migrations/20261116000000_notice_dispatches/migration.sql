-- CreateTable
CREATE TABLE `notice_dispatches` (
    `key` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `notice_dispatches_created_at_idx`(`created_at`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
