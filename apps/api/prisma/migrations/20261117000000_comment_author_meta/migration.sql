-- The commenter's proven IP address and browser user agent (WordPress `comment_author_IP`,
-- `comment_agent`). Existing comments have none.
ALTER TABLE `comments`
  ADD COLUMN `author_ip` VARCHAR(45) NULL,
  ADD COLUMN `author_user_agent` VARCHAR(255) NULL;
