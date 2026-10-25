# Meilisearch 검색

상위 문서: [AGENTS.md](../../AGENTS.md)

Public search engines are registered through `PluginContext.searchEngines`.
Core database and Meilisearch implementations use that registry; failing plugin
engines fall back through it. `search.query` and `search.results` apply whether
the query uses an engine or the direct database fallback. `search.document`
applies to both full rebuild and incremental indexing without permitting an ID
change. Search result filters cannot introduce IDs outside the selected page.

Successful rebuilds and incremental batches publish `search.indexed` only after
index writes, outbox acknowledgement and state persistence. Its payload contains
the operation and affected content IDs (null for a full rebuild), never secrets.

- MariaDB is the source of truth and always able to answer (`FULLTEXT` over title, excerpt and body text). Meilisearch is an optional accelerator configured in Settings → Search (host, sealed key, index prefix). Category scopes use a recursive CTE from the requested root instead of loading the whole hierarchy.
- Every content write that can change public results inserts into `search_outbox` in the same transaction (term changes and bulk deletes queue a full rebuild with a null `content_id`). The `search.sync` task drains the outbox into Meilisearch and rebuilds by building `<prefix>_content_next` and swapping it in.
- Public search uses the index only while it is enabled, built for the current host and index, not recently failing (30 s pause after an error) and the outbox is empty; otherwise it uses the database. Results are ids only; summaries are always loaded from MariaDB, so nothing unpublished can appear. Author-filtered searches always use the database. Admin search always uses the database.
