-- Namespaced plugin type keys; widening preserves all existing values.
ALTER TABLE `contents` MODIFY COLUMN `type` VARCHAR(136) NOT NULL;
