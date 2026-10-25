ALTER TABLE `media`
  ADD COLUMN `storage_driver` VARCHAR(128) NOT NULL DEFAULT 'local',
  ADD COLUMN `public_url` TEXT NULL,
  ADD COLUMN `byte_size` INTEGER NULL,
  ADD COLUMN `etag` VARCHAR(255) NULL,
  ADD COLUMN `missing_at` DATETIME(3) NULL;

UPDATE `media`
SET `public_url` = CONCAT('/media/', `storage_key`), `byte_size` = `size`;

-- Legacy derivatives did not record byte counts. NULL means unknown until resync.
UPDATE `media` m
SET `variants` = (
  SELECT JSON_OBJECTAGG(names.name, JSON_OBJECT(
    'key', JSON_UNQUOTE(JSON_EXTRACT(m.variants, CONCAT('$."', names.name, '".key'))),
    'storageKey', JSON_UNQUOTE(JSON_EXTRACT(m.variants, CONCAT('$."', names.name, '".key'))),
    'storageDriver', 'local',
    'publicUrl', CONCAT('/media/', JSON_UNQUOTE(JSON_EXTRACT(m.variants, CONCAT('$."', names.name, '".key')))),
    'byteSize', NULL,
    'mime', 'image/webp',
    'etag', NULL,
    'missingAt', NULL,
    'width', JSON_EXTRACT(m.variants, CONCAT('$."', names.name, '".width')),
    'height', JSON_EXTRACT(m.variants, CONCAT('$."', names.name, '".height'))
  ))
  FROM JSON_TABLE(JSON_KEYS(m.variants), '$[*]' COLUMNS(name VARCHAR(64) PATH '$')) names
)
WHERE JSON_VALID(`variants`) AND JSON_LENGTH(`variants`) > 0;
