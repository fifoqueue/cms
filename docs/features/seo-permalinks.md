# SEO와 고유주소

상위 문서: [AGENTS.md](../../AGENTS.md)

`content.permalink` may select only the entry's already-owned current or alias
paths. Unrouted paths and paths owned by other entries are rejected and logged
by the hook bus. New path shapes must use permalink tokens so writes remain
collision-checked. Selecting an owned alias serves that alias without a
self-redirect.

Permalink templates can contain plugin token identifiers. Content saves,
taxonomy changes, author-profile changes, privacy erasure and permalink-settings
regeneration resolve them before the
existing transactional collision checks. If a missing custom token would make
the path structurally invalid, computation falls back to the entry's slug path.
Existing current paths remain stored when a plugin is disabled; regeneration
uses the fallback and retains previously public paths as redirects.

Settings-driven regeneration scans at most 200 entries per batch. Plugin
resolution runs outside the transaction with a five-second aggregate budget.
Each write batch rechecks its input snapshot under the path lock, then runs the
existing collision checks and atomically advances a durable cursor. Retrying the
same settings resumes; submitting different settings restarts the scan. Progress
and completion are logged. While a regeneration is pending, competing path
writes return a conflict. Already committed batches survive interruption; settings
are published only after the scan finishes. This is per-batch atomicity, not
whole-site rollback.

Term changes, author renames/reassignments and privacy erasure only enqueue
affected content IDs in their metadata transaction; they never invoke token
resolvers there. A leased scheduler task resumes the durable work every five
seconds, including after restart, using the same batches, budgets, collision
checks and progress logs. Existing paths continue to serve until their batch
commits. A failed regeneration does not roll back the already-committed metadata.

Discovery providers are extensible through the SDK sitemap registry, including
the core content/taxonomy/author providers. The web sitemap index must enumerate
`/api/v1/seo/providers` rather than maintain a fixed provider list. Sitemap pages
already contain filtered entries; feed/channel, crawler text and metadata
serializers use the authenticated `/api/v1/seo/filter` RPC before escaping.
Web integration is separate from the API contract; the API does not serialize
the website's final XML or HTML.

Markdown serializers submit the rendered public text through `seo.markdown`
using the same trusted frontend RPC before returning `.md` responses. Feed types
are not registrable until web routing/serialization has a shared type contract;
existing content/comment feeds remain extensible through item/channel filters.

- SEO is a core capability, independent of installed plugins and selected themes. Its settings and content/term metadata are validated through `@cms/sdk`. Global settings contain only publishable metadata/crawler policy; never analytics credentials or provider secrets.
- `AdminEntrySeo.focusKeyword` is editorial data, not public metadata. Public content, taxonomy, discovery, page data, JSON-LD, feeds, and Markdown must use the public SEO allowlist. Omitting `seo` from a content/term update preserves saved SEO rather than clearing it.
- Public pages render one authoritative SSR metadata set: title/description, canonical, robots directives, OpenGraph/Twitter, and escaped JSON-LD. Structured data must describe visible content; no fabricated ratings, authors, FAQs, or ranking guarantees. Core routing identity and SEO policy cannot be overwritten by `content.public` filters.
- Absolute canonical/discovery URLs come only from the configured public `siteUrl`, never a request's Host header. Missing configuration must not invent localhost URLs. Search pages and empty archives are not indexable. `noindex` is not access control; pages remain public, and crawlers must be able to read the directive.
- Sitemaps use a lightweight, paginated published-content projection, not full editor documents or HTML. Drafts, `noIndex` entries, and entries canonicalized to another URL are excluded. Indexing/category/tag settings apply consistently across metadata and discovery.
- `llms.txt` is an optional discovery proposal, not a ranking feature. Markdown alternates contain published content only, point to the real canonical URL, and never expose editorial JSON or private metadata. AI search and training crawler controls are independent; robots rules are advisory, not authorization.
- Permalink settings are per content type (`post`, `article`, `page`). The default `/%slug%` preserves existing URLs. Tokens include `%year%`, `%month%`/`%monthnum%`, `%date%`/`%day%`, `%hour%`, `%minute%`, `%second%`, `%title%`, `%slug%`/`%postname%`, `%id%`/`%post_id%`, `%category%`, `%author%`, and `%pagename%`; dates use the site time zone on new saves, and `%title%` uses `encodeURIComponent(title)` rather than slugification.
- `/p/%year%%month%%date%` produces `/p/20261022`; `/post/%title%` produces an encoded-title URL. Date-only templates can collide. Reject collisions atomically rather than changing a URL silently or serving the wrong entry. Reserve administrative/discovery routes and reject traversal, external URLs, and unsupported tokens.
- Canonical content paths and history belong to persistent routing data, not client-side guesses. Content links, SEO, feeds, sitemaps, and previews must use the same path. Existing aliases redirect directly to the latest published path; drafts and deleted entries never resolve publicly.
- API contracts: `GET /api/v1/seo` (public settings), `GET/PUT /api/v1/admin/seo` (authenticated settings), `GET /api/v1/seo/sitemap?kind=content|category|tag&page=&pageSize=` (bounded discovery), `GET /api/v1/permalinks` and `GET/PUT /api/v1/admin/permalinks` (templates), and `GET /api/v1/resolve?path=` (published content plus a redirect flag). The web exposes `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:page.xml`, `/feed.xml` (also `?category=`, `?tag=`, `?author=`; full text or excerpt per Settings → Reading, with `dc:creator`, categories and the first audio file as enclosure; types marked searchable except pages; bodies of unprotected entries are read four at a time and enclosures carry the library file's size; `?category=` etc. must be a whole valid slug), `/llms.txt`, `/:slug.md` and `/oembed?url=&format=json` (oEmbed provider: an iframe-free `rich` card for published, unprotected entries on the configured site address; single entries link it with `rel="alternate" type="application/json+oembed"`). Feed discovery links appear only while the feed is served (indexing on and site URL set). Configure SEO in `/admin/seo`; permalink patterns and category/tag bases live in Settings → Permalinks (`/admin/settings/permalinks`), as in WordPress.
- Reference: [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [robots directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [OpenGraph](https://ogp.me/), [sitemaps](https://www.sitemaps.org/protocol.html), [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/), and [WordPress permalinks](https://wordpress.org/documentation/article/customize-permalinks/).
