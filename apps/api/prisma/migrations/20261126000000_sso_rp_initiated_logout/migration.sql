ALTER TABLE `sessions`
  ADD COLUMN `oidc_provider_id` VARCHAR(32) NULL,
  ADD COLUMN `oidc_client_id` TEXT NULL,
  ADD COLUMN `oidc_id_token` TEXT NULL;

ALTER TABLE `sign_in_transactions`
  ADD COLUMN `oidc_provider_id` VARCHAR(32) NULL,
  ADD COLUMN `oidc_client_id` TEXT NULL,
  ADD COLUMN `oidc_id_token` TEXT NULL;
