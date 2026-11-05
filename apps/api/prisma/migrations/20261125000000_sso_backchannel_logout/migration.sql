ALTER TABLE `sessions`
  ADD COLUMN `oidc_issuer` VARBINARY(255) NULL,
  ADD COLUMN `oidc_subject` VARBINARY(255) NULL,
  ADD COLUMN `oidc_sid` VARBINARY(255) NULL,
  ADD INDEX `sessions_oidc_issuer_oidc_subject_idx` (`oidc_issuer`, `oidc_subject`),
  ADD INDEX `sessions_oidc_issuer_oidc_sid_idx` (`oidc_issuer`, `oidc_sid`);

ALTER TABLE `sign_in_transactions`
  ADD COLUMN `oidc_issuer` VARBINARY(255) NULL,
  ADD COLUMN `oidc_subject` VARBINARY(255) NULL,
  ADD COLUMN `oidc_sid` VARBINARY(255) NULL;
