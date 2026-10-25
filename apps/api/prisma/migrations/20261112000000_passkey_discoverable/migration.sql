-- Existing credentials have no recorded resident-key guarantee.
ALTER TABLE `passkeys` ADD COLUMN `discoverable` BOOLEAN NOT NULL DEFAULT false;
