-- Preserve existing category/tag values while allowing registered taxonomy keys.
ALTER TABLE taxonomy_terms MODIFY taxonomy VARCHAR(32) NOT NULL;
