-- Index-ordered list pages: published lists without a type filter and the admin list.
CREATE INDEX `contents_status_published_at_idx` ON `contents`(`status`, `published_at`);

CREATE INDEX `contents_updated_at_idx` ON `contents`(`updated_at`);

-- Expired-session cleanup on sign-in.
CREATE INDEX `sessions_expires_at_idx` ON `sessions`(`expires_at`);
