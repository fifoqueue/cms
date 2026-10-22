ALTER TABLE contents ADD COLUMN parent_id CHAR(36) NULL;
CREATE INDEX contents_parent_id_idx ON contents(parent_id);
ALTER TABLE contents ADD CONSTRAINT contents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES contents(id) ON DELETE SET NULL ON UPDATE RESTRICT;
