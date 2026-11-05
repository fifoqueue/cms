# SEO와 고유주소

상위 문서: [AGENTS.md](../../AGENTS.md)

## Crawler and agent discovery

SEO settings in `/admin/seo` now include:

- `allowAiTraining` governs training tokens (GPTBot, ClaudeBot, anthropic-ai, CCBot,
  Google-Extended, Applebot-Extended, Meta-ExternalAgent, Bytespider, cohere-ai,
  Amazonbot and others). `allowAiSearch` governs search and user-fetch tokens
  (including OAI-SearchBot, Claude-SearchBot, PerplexityBot, ChatGPT-User,
  Claude-User and Perplexity-User). The maintained catalogue is `AI_BOTS` in
  `apps/web/src/lib/server/seo-discovery.ts`.
- `aiBotOverrides`: one `Bot: allow` or `Bot: disallow` per line, case-insensitive.
  `extraRobotsRules`: bounded robots directives/comments, not HTML or control
  characters. Ungrouped extras belong to an explicit wildcard group; every extra
  group repeats the private-path exclusions. Extra Allow rules must have a literal
  prefix disjoint from the generated crawl-trap paths, including home search
  `/?s=` (and percent-encoded unreserved characters). Generation and validation
  share `SEO_ROBOTS_DISALLOW_PATHS` in `packages/sdk/src/seo.ts`;
  root `/` and `/preview/theme/` are exceptions. Ambiguous wildcard
  prefixes that could reopen private paths are rejected.
  Global indexing-off overrides these settings and blocks crawling.
  Preview-token paths and home search are disallowed; `/preview/theme/` remains
  allowed for public CSS. Settings failures produce a short-lived, fail-closed
  robots response rather than a server error. Robots rules are advisory, not access control.
- `feedsEnabled` independently publishes `/feed.xml` and JSON Feed 1.1 at
  `/feed.json`. Both support `?category=`, `?tag=`, `?author=`,
  `?taxonomy=<key>&term=<slug>` and `?archive=<type>`. RSS uses stable
  `urn:uuid:<id>` GUIDs, `lastBuildDate`, `atom:updated` and `atom:self`.
  Comments feeds use the same feed toggle, exclude non-discoverable or protected
  parent entries, include `atom:self`, and cache publicly for 60 seconds.
- `indexNowEnabled`: enabling generates a persistent public ownership key under
  the SEO settings transaction lock. Clients cannot replace the key. The site
  serves it at `/indexnow-key.txt`; submissions specify that `keyLocation`.
  Published changes, former public paths, trash, restore and deletion notify
  IndexNow through a core port/HTTP adapter. `webSubHub` adds a hub link only to
  `/feed.xml`, the feed notified with `hub.mode=publish` / `hub.url`.
  Narrowed feeds and JSON Feed do not advertise a hub.
  Delivery is best-effort, non-blocking and bounded to five seconds, with failures
  logged independently; it is not a durable retry queue. Both use the existing
  `webhook` egress service (including SSRF/DNS protections, HTTP hooks and
  administrator-managed private-network exceptions). No environment setting or
  schema migration is needed.

Discovery responses use weak ETags calculated after plugin filtering, with
Last-Modified when a content timestamp exists. Only matching If-None-Match requests
return 304. Last-Modified is descriptive, not a reliable monotonic version of
filtered output: removals, settings and plugin changes can leave it unchanged or
move it backwards. If-Modified-Since alone therefore receives the current body.

Sitemaps exclude password-protected entries. Non-category taxonomy archives obey
`indexTags`. The `archive` provider lists non-empty active types with `archive: true`.
Terms inherit the newest assigned published content update, including hierarchical
descendants; dynamic `/` uses the newest discoverable entry, while static homes
omit lastmod rather than borrowing another entry's date. Chunk index entries include
their newest timestamp. Content chunks retain ascending UUIDv7 order: these IDs
are time-ordered, so new inserts do not reshuffle earlier chunks. Removals can
still compact offset-based pages. `sort=modified` on the sitemap query supports
the bounded home timestamp lookup; default chunk ordering remains `stable`.
Image extensions include featured and body media-library images; plugins can
add external image URLs and language alternates through `sitemap.entries`.
Image-rich API pages are split into whole-entry parts of at most 50 MiB of
uncompressed UTF-8 XML, including escaping and the XML envelope. Part one retains
`/sitemaps/<kind>/<page>.xml`; additional parts use `?part=2`, `?part=3`, etc.,
and all parts are enumerated by the index. Each entry still allows at most 1,000
images; oversized individual entries or indexes fail rather than silently dropping URLs.
Failure to load reading settings fails the chunk instead of publishing duplicate
static-home URLs.

`/llms.txt` has an H1, a blockquoted summary and Pages, Recent posts, Topics and
Optional link sections. `/llms-full.txt` concatenates whole Markdown documents:
at most 200 entries, 2,000 scanned summaries, and 512,000 UTF-8 bytes. Protected,
noindex and off-site-canonical entries are excluded, with protection checked again
when bodies are loaded. Oversized entries are omitted, never split. This is a
bounded reading aid, not a guaranteed complete export. Both files follow the
indexing/llms toggle. `llms-full.txt`, `feed.json` and `indexnow-key.txt` are reserved
archive bases.

Topics use the sitemap's protected-filtered category data, ordered by distinct
published, unprotected assignments (`sort=popular`), including descendants.
Recent feed/llms lists filter before the final limit, scanning at most twenty
100-entry batches per type; they may return fewer entries if that budget is exhausted.

Markdown preserves GFM tables/task lists and media/embed source links. Its YAML
frontmatter uses JSON-quoted YAML scalars/arrays for title, canonical, published,
updated, author, categories, tags, type, lang and description. The byline falls
back to the public author, and `lang` comes from the site locale.

Head integration uses `feedsEnabled && siteUrl` for feed autodiscovery (not
the indexing flag), advertises `application/feed+json` at `/feed.json`, and uses
`feedPath` for custom-taxonomy and content-type archive alternates.

## Per-page metadata

`apps/web/src/lib/seo/head.ts` builds the same metadata for SSR and navigation.
Home title/description apply to `/`, including static front pages; the home title
is not wrapped in the title template. A posts page uses its entry SEO instead.
An implicit article-only home keeps `/`; explicit `?type=article` remains distinct.
Pagination and split-entry parts receive their own title, description and canonical.

Articles fall back to the public author (`/author/<slug>#person`) and featured image.
Author ProfilePage nodes use the same Person identity, bio and public avatar.
Sharing image order is entry SEO, featured image, site default, including in the
editor preview. Featured images use the available size nearest 1200px and known
dimensions/MIME/alt. Responsive sizes preserve aspect ratio; the head does not
invent 16:9, 4:3 or square crops. External SEO image URLs have no invented dimensions.
CollectionPage lists describe only the entries on the current page. CollectionPage
is not an entry override: legacy saved values read as WebPage and new saves reject it.

Breadcrumbs use public page ancestors and term ancestors, respecting configured
archive bases. Password-protected, private and trashed ancestors are not exposed.
The last breadcrumb URL identifies the displayed page, including its pagination.
BreadcrumbList is emitted only when the selected template or its included parts
contains a visible breadcrumbs block; journal templates without that block emit none.
The static front page has no duplicate root breadcrumb.

SEO settings include an alternative site name, site/default creator handles and
author/content-type archive overrides (kind plus author slug or type key, title,
description, image and noindex). Overrides live in the existing `seo` settings
record, are editable at `/admin/seo`, and use an explicit public allowlist.
Author profiles currently have no social-link field, so creator uses the configured
default author handle, then the site handle.

Entries support inherited or explicit max-snippet/max-image-preview and nosnippet.
The additive `20261105052331_seo_snippet_controls` migration stores these on content
and terms. Valid schema choices are Article, BlogPosting, NewsArticle, TechArticle,
WebPage, AboutPage and ContactPage; FAQ markup is not inferred from
arbitrary prose. Article headline, dates, known author/image and publisher are emitted
when available. Google recommends these Article properties but has no required
Article fields; TechArticle is valid schema.org, not a promised Google rich result.
ProfilePage supplies the required named mainEntity.

Protected entries are noindex, including unlocked views. Locked public projections
suppress SEO/social descriptions and automatic summaries; their heads never fall
back to excerpts or site/home descriptions. Proven-unlocked responses and authorized
signed previews preserve descriptions, including on static front pages and posts
pages. `protected` denotes the response's locked state; the persistent
`passwordProtected` flag retains noindex after unlocking. Anonymous lists and
discovery outputs never receive an unlock proof and retain the locked policy.
Saves retain generated summaries for authorized reads while keeping protected
search text empty; existing empty summaries are regenerated on the next save.
Error pages have an error title and noindex.
Markdown alternates require a configured origin, indexing, an unprotected entry
and a self-canonical URL. The route and head share this rule and resolve a static
front page to `/`. Without a configured origin, the head does not invent canonical,
og:url or featured-image URLs; the admin settings page warns about these omissions.

Canonical public entry URLs also negotiate Markdown when `Accept: text/markdown`
has a greater effective quality than `text/html`. Specific ranges override wildcards;
`q=0` excludes a representation and ties retain HTML. The hook invokes the existing
`/[slug].md` handler, preserving its filters, protection/discoverability checks,
body, cache policy and ETag. Both representations, including 304s, send `Vary: Accept`;
proxies must preserve that header and include Accept in their variant selection.
HTML entries also send `Link: <…/slug.md>; rel="alternate"; type="text/markdown"`.
The header, head and Markdown endpoint share `markdownDiscoverable` in
`apps/web/src/lib/seo/paths.ts`. Data requests, previews, login screens and listings
are not negotiated as entries.

## 공개 HTML과 링크

공개 HTML 검증자와 프록시 쿠키 우회 조건은 [운영 문서](../operations.md#공개-html-압축과-캐시)를 참고하세요.
`__data.json`, API·관리·미리보기 내부 응답에는 `X-Robots-Tag: noindex, nofollow`를,
RSS/Atom/JSON Feed에는 `noindex, follow`를 적용합니다. 미디어는 이미지뿐 아니라 PDF도
기본적으로 색인 가능하며 미디어 전체를 noindex로 막지 않습니다.

목록의 첫 페이지 링크는 `page=1`을 생략하며 일별 보관함의 페이지 이동은
연·월·일을 유지합니다. 댓글 답글 링크는 기능을 유지하되 nofollow입니다.
`archive/<type>` 및 날짜 보관함은 끝 슬래시 없는 주소로 정규화합니다.

테마 group은 `article` 태그를 지원하며 쿼리 루프의 각 항목은 article로 묶습니다.
Canvas와 Journal의 기본 single/page 템플릿도 본문을 article로 묶고,
기본 single 템플릿에는 관련 글을 배치합니다. 저장된 사용자 지정 템플릿은 덮어쓰지 않습니다.
`related-posts` 블록은 선택한 분류(category 또는 tag)를 공유하는 같은 유형의
게시물로 연결합니다. 현재 글과 잠긴 글은 제외하고 여러 분류의 중복 결과는
한 번만 표시합니다. 각 분류에서 최대 count개를 읽어 최신순으로 합친 뒤
최대 count개를 SSR 링크로 표시합니다. 공통 분류가 없으면 표시하지 않습니다.

본문 이미지의 비어 있는 대체 텍스트는 읽을 때 미디어 라이브러리의 최신 값으로
채우고, 빠진 width와 height를 각각 보충합니다. 문서가 지정한 대체 텍스트와
크기는 보존합니다. Cover와 단일 글의 SEO 대체 이미지는 eager/high priority입니다.
테마 Image/Cover/Media & Text와 SEO 대체 이미지는 공개 미디어 메타데이터를 조회하여
라이브러리의 width/height/srcset을 사용합니다. Image와 Media & Text는 lazy입니다.
등록되지 않은 외부 이미지의 크기를 추측하거나 해당 서버로 메타데이터 요청을 보내지 않습니다.

공개 본문은 SSR DOM에 한 번만 기록합니다. SvelteKit transport의 `HtmlBody`는 실제
렌더링된 본문을 hydration 때 DOM에서 복구하며, 클라이언트 이동과 본문을 표시하지
않는 템플릿에는 원문을 전송합니다. 브라우저가 정규화한 동등한 HTML을 복구하므로
해당 `{@html}`의 문자열 차이 경고만 억제하고 DOM은 그대로 유지합니다.
오류 템플릿/파트/쿼리는 정상 레이아웃 데이터에 포함하지 않고 Kit 3 `handleError`에서
해당 상태에 필요한 것만 불러옵니다. 404/410은 404 템플릿, 다른 오류는 500 템플릿을
우선하며 없으면 index 템플릿을 사용합니다.

고유주소의 저장·충돌 검사는 여전히 바이트 단위입니다. 정확한 경로와 끝 슬래시
변형이 없을 때만 ASCII 대소문자 변형을 조회하여 유일한 소유자에게 리디렉션합니다.
여러 저장 경로가 일치하면 추측하지 않고 404로 남깁니다. 악센트나 percent-encoded
비ASCII 문자는 접지 않습니다. ASCII 소문자 경로의 SHA-256인 `folded_hash` 색인을
사용하고, 해시 조회 후 실제 경로도 비교합니다. 정식 소유권의 바이트 비교는 바뀌지 않습니다.

각 경로의 `was_public`으로 공개 이력을 기록합니다. 글이 과거에 발행되었더라도
다시 초안으로 바꾼 뒤 만든 주소에는 공개 이력이 없습니다. 휴지통·영구 삭제 뒤에도
그 주소는 404이며, 공개 이력이 있는 주소만 410입니다. 발행·예약 발행·공개 글 복원과
공개 상태의 경로 변경에서 실제로 공개되는 경로를 같은 트랜잭션 안에서 기록합니다.
영구 삭제는 검증된 공개 경로만 `content_tombstones`에 남깁니다.
알 수 없는 경로와 공개 이력을 검증할 수 없는 이전 데이터는 404입니다.
새 소유자가 경로를 다시 사용하면 새 소유자가 우선합니다. 마이그레이션 이전에 이미
삭제된 경로는 복구할 수 없어 404를 유지합니다. API의 `gone`(410)은 웹에서도 410입니다.

`content.permalink`는 해당 항목이 이미 소유한 현재 경로나 별칭 경로만 선택할 수 있습니다. 라우팅되지 않은 경로와 다른 항목이 소유한 경로는 거부되며 훅 버스에 기록됩니다. 새로운 형태의 경로는 쓰기 시 충돌 검사가 유지되도록 고유주소 토큰을 사용해야 합니다. 소유한 별칭을 선택하면 자기 자신으로의 리디렉션 없이 해당 별칭을 그대로 제공합니다.

고유주소 템플릿에는 플러그인 토큰 식별자를 넣을 수 있습니다. 콘텐츠 저장, 분류 변경, 글쓴이 프로필 변경, 개인정보 삭제, 고유주소 설정 재생성은 기존의 트랜잭션 충돌 검사 전에 이 토큰을 해석합니다. 누락된 사용자 지정 토큰 때문에 경로 구조가 올바르지 않게 되면 계산은 해당 항목의 슬러그 경로로 대체됩니다. 플러그인을 비활성화해도 기존 현재 경로는 그대로 저장됩니다. 재생성은 대체 경로를 사용하고, 이전에 공개되었던 경로는 리디렉션으로 유지합니다.

설정에 따른 재생성은 배치당 최대 200개 항목을 검사합니다. 플러그인 해석은 트랜잭션 밖에서 총 5초의 예산 안에 실행됩니다. 각 쓰기 배치는 경로 잠금 아래에서 입력 스냅샷을 다시 확인한 뒤 기존 충돌 검사를 실행하고, 지속되는 커서를 원자적으로 앞으로 옮깁니다. 같은 설정으로 다시 시도하면 이어서 진행하고, 다른 설정을 제출하면 검사를 처음부터 다시 시작합니다. 진행 상황과 완료는 로그에 기록됩니다. 재생성이 대기 중인 동안 경쟁하는 경로 쓰기는 충돌을 반환합니다. 이미 커밋된 배치는 중단되어도 유지되며, 설정은 검사가 끝난 뒤에만 게시됩니다. 이는 배치 단위의 원자성이며 사이트 전체 롤백이 아닙니다.

용어 변경, 글쓴이 이름 변경/재지정, 개인정보 삭제는 메타데이터 트랜잭션 안에서 영향받는 콘텐츠 ID를 큐에 넣기만 하며, 그곳에서 토큰 해석기를 호출하지 않습니다. 임대(lease)된 스케줄러 작업이 재시작 후에도 5초마다 지속 작업을 이어서 처리하며, 같은 배치·예산·충돌 검사·진행 로그를 사용합니다. 기존 경로는 해당 배치가 커밋될 때까지 계속 제공됩니다. 재생성이 실패해도 이미 커밋된 메타데이터는 롤백되지 않습니다.

탐색 제공자는 코어 콘텐츠/분류/글쓴이 제공자를 포함해 SDK 사이트맵 레지스트리로 확장할 수 있습니다. 웹 사이트맵 인덱스는 고정된 제공자 목록을 유지하지 않고 `/api/v1/seo/providers`를 열거해야 합니다. 사이트맵 페이지는 이미 필터링된 항목을 담고 있으며, 피드/채널, 크롤러 텍스트, 메타데이터 직렬화기는 이스케이프 전에 인증된 `/api/v1/seo/filter` RPC를 사용합니다. 웹 통합은 API 계약과 별개이며, API는 웹사이트의 최종 XML이나 HTML을 직렬화하지 않습니다.

Markdown 직렬화기는 `.md` 응답을 반환하기 전에 같은 신뢰된 프런트엔드 RPC로 렌더링된 공개 텍스트를 `seo.markdown`에 제출합니다. 웹 라우팅/직렬화에 공유 타입 계약이 생기기 전까지 피드 유형은 등록할 수 없으며, 기존 콘텐츠/댓글 피드는 항목/채널 필터로 계속 확장할 수 있습니다.

- SEO는 설치된 플러그인과 선택한 테마에 독립적인 코어 기능입니다. 설정과 콘텐츠/용어 메타데이터는 `@cms/sdk`로 검증합니다. 전역 설정에는 게시 가능한 메타데이터/크롤러 정책만 담고, 분석 자격 증명이나 제공자 비밀 값은 절대 담지 않습니다.
- `AdminEntrySeo.focusKeyword`는 편집용 데이터이며 공개 메타데이터가 아닙니다. 공개 콘텐츠, 분류, 탐색, 페이지 데이터, JSON-LD, 피드, Markdown은 공개 SEO 허용 목록을 사용해야 합니다. 콘텐츠/용어 업데이트에서 `seo`를 생략하면 저장된 SEO를 지우지 않고 유지합니다.
- 공개 페이지는 하나의 권위 있는 SSR 메타데이터 집합을 렌더링합니다: 제목/설명, 정식 URL, robots 지시자, OpenGraph/Twitter, 이스케이프된 JSON-LD. 구조화 데이터는 화면에 보이는 콘텐츠를 설명해야 하며, 조작된 평점, 글쓴이, FAQ, 순위 보장은 허용되지 않습니다. 코어 라우팅 식별자와 SEO 정책은 `content.public` 필터로 덮어쓸 수 없습니다.
- 절대 정식/탐색 URL은 설정된 공개 `siteUrl`에서만 가져오며 요청의 Host 헤더에서는 가져오지 않습니다. 설정이 없을 때 localhost URL을 만들어 내면 안 됩니다. 검색 페이지와 빈 아카이브는 색인할 수 없습니다. `noindex`는 접근 제어가 아니므로 페이지는 계속 공개되며, 크롤러가 해당 지시자를 읽을 수 있어야 합니다.
- 사이트맵은 전체 편집기 문서나 HTML이 아닌, 가볍고 페이지로 나뉜 게시 콘텐츠 프로젝션을 사용합니다. 초안, `noIndex` 항목, 다른 URL을 정식 URL로 지정한 항목은 제외됩니다. 색인/카테고리/태그 설정은 메타데이터와 탐색 전반에 일관되게 적용됩니다.
- `llms.txt`는 선택적인 탐색 제안이며 순위 기능이 아닙니다. Markdown 대체본은 게시된 콘텐츠만 담고, 실제 정식 URL을 가리키며, 편집용 JSON이나 비공개 메타데이터를 절대 노출하지 않습니다. AI 검색 크롤러와 학습 크롤러 제어는 서로 독립적이며, robots 규칙은 권고일 뿐 권한 부여가 아닙니다.
- 고유주소 설정은 콘텐츠 유형(`post`, `article`, `page`)별입니다. 기본값 `/%slug%`는 기존 URL을 유지합니다. 토큰은 `%year%`, `%month%`/`%monthnum%`, `%date%`/`%day%`, `%hour%`, `%minute%`, `%second%`, `%title%`, `%slug%`/`%postname%`, `%id%`/`%post_id%`, `%category%`, `%author%`, `%pagename%`을 포함합니다. 새로 저장할 때 날짜는 사이트 시간대를 사용하며, `%title%`은 슬러그화 대신 `encodeURIComponent(title)`을 사용합니다.
- `/p/%year%%month%%date%`는 `/p/20261022`를 만들고, `/post/%title%`은 인코딩된 제목 URL을 만듭니다. 날짜만 있는 템플릿은 충돌할 수 있습니다. 충돌은 URL을 조용히 바꾸거나 엉뚱한 항목을 제공하는 대신 원자적으로 거부합니다. 관리/탐색 경로는 예약하고, 경로 탐색(traversal), 외부 URL, 지원되지 않는 토큰은 거부합니다.
- 정식 콘텐츠 경로와 그 이력은 클라이언트 측 추측이 아니라 영속적인 라우팅 데이터에 속합니다. 콘텐츠 링크, SEO, 피드, 사이트맵, 미리보기는 같은 경로를 사용해야 합니다. 기존 별칭은 최신 게시 경로로 바로 리디렉션하며, 초안과 삭제된 항목은 공개적으로 해석되지 않습니다.
  피드 공개 여부는 검색 색인과 독립적인 `feedsEnabled` 설정으로 제어합니다.
- 참고: [Google AI 기능](https://developers.google.com/search/docs/appearance/ai-features), [Article 구조화 데이터](https://developers.google.com/search/docs/appearance/structured-data/article), [robots 지시자](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [OpenGraph](https://ogp.me/), [사이트맵](https://www.sitemaps.org/protocol.html), [OpenAI 크롤러](https://developers.openai.com/api/docs/bots), [llms.txt 제안](https://llmstxt.org/), [WordPress 고유주소](https://wordpress.org/documentation/article/customize-permalinks/).
