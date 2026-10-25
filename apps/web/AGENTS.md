# apps/web 규약

상위 문서: [AGENTS.md](../../AGENTS.md)

`@cms/web`(SvelteKit) 프런트엔드의 규칙입니다. 기능별 동작은 [docs/features/](../../docs/features/)를 봅니다.

## 디렉터리 구성

```
    src/routes/(site)/      공개 테마
    src/routes/admin/       관리자 ((auth): 로그인·셋업, (app): 인증 필요)
    src/lib/server/         API 클라이언트 생성, 세션, 폼 파싱 (서버 전용)
    src/lib/admin/          관리자 컴포넌트 (Editor, ContentForm, PluginSettingsForm …)
    src/lib/theme/          블록 테마 렌더러: TemplateView(템플릿 계층), blocks/(블록별 컴포넌트), AdminBar, SlotOutlet, WidgetArea, Comments …
    src/lib/i18n/           관리자·테마 문구 카탈로그(en, ko). 화면 문구는 모두 여기서 가져옵니다
    src/lib/components/ui/  shadcn-svelte 생성물 (직접 수정 최소화)
```

## 프론트엔드 규약

`apps/web`(그리고 앞으로 만들 모든 프론트엔드/테마)가 지켜야 할 규칙입니다.

1. **API로만 통신**: `@cms/sdk/client`의 클라이언트만 사용합니다. DB, `@cms/api`, 플러그인 코드 import 금지.
2. **서버에서만 호출**: API 호출은 `+page.server.ts`/`+layout.server.ts`/form action/`hooks.server.ts`에서만 합니다. 브라우저는 API 주소나 토큰을 모릅니다.
3. **세션**: 로그인 시 받은 토큰을 HTTPS에서는 host-bound httpOnly 쿠키(`__Host-cms_session`), 평문 HTTP(로컬 개발 포함)에서는 별도 이름 `cms_session`에 저장하고 `Authorization: Bearer`로 전달합니다. HTTPS는 이전 이름을 인증이나 마이그레이션에 사용하지 않으므로 전환 뒤 한 번 다시 로그인해야 합니다. 진행 중인 로그인(모든 방식의 단계·초대 링크 설정·2단계 인증 등록·SSO 연결)은 쿠키 하나(`#lib/server/sso-cookie.js`, HTTPS는 `__Host-cms_sso`만, HTTP는 `cms_sso`)에 두며 트랜잭션 핸들은 페이지 데이터에 넣지 않습니다. 로그인 화면·초대 링크 화면은 API가 준 방식 설명을 그대로 그리며 플러그인 id로 분기하지 않습니다([로그인](../../docs/auth/sign-in.md#web)). `/admin` 보호는 `hooks.server.ts` 한 곳에서 합니다. 로그인 화면은 관리자 설정의 공개 경로(기본 `/login`)에서 직접 렌더링·제출하며 `/admin/login`은 존재하지 않습니다. 로그인 링크를 숨기면 로그아웃 상태의 보호된 관리자 요청은 캐시 불가능한 404가 되고, 알 수 없는 `/admin/*` 주소도 인증 리디렉션으로 바뀌지 않습니다. 링크가 보일 때만 보호된 관리자 GET을 공개 로그인 경로로 보냅니다. 로그인 후 `returnPath`(`#lib/server/return-path.js`)는 정규화된 같은 사이트의 공개/관리 경로만 허용하고 인증 경로·외부 주소는 대시보드로 바꿉니다. 비밀번호와 SSO 로그인이 같은 목적지를 사용합니다.
4. **슬롯 렌더링 의무**: 모든 테마는 `SLOT_NAMES`의 **모든 슬롯**을 정해진 위치에 렌더링해야 합니다 — `head`(문서 head), `site.header`(헤더 끝), `site.footer`(푸터), `content.before`/`content.after`(본문 앞/뒤), `comments.before`/`comments.after`(댓글 영역 앞/뒤, 댓글 영역이 있을 때). 블록 테마에서는 코어 렌더러가 위치를 보장합니다: `site.header`/`site.footer`는 header/footer 영역 템플릿 파트 뒤(템플릿에 없으면 페이지 처음/끝), `content.*`는 `post-content` 블록, `comments.*`는 `comments` 블록이 출력합니다. `GET /api/v1/slots?path=&contentId=`로 받고 `SlotOutlet`으로 출력합니다. 슬롯 조회 실패는 빈 슬롯으로 처리합니다(`loadSlots`). 슬롯은 페이지마다 다르므로 각 페이지 load가 받습니다. `contentId`를 생략하면 API가 `path`의 현재 주소 콘텐츠를 찾으므로, 콘텐츠 페이지는 주소 조회와 슬롯을 함께 요청합니다. 공개 레이아웃 load는 `url`·`route`를 읽지 않습니다(읽으면 클라이언트 이동·링크 미리 로드 때마다 레이아웃 API 호출이 모두 다시 실행됩니다). 오류 페이지에는 슬롯이 없습니다.
5. **플러그인을 모름**: 프론트는 특정 플러그인의 존재를 가정하지 않습니다. 플러그인 효과는 슬롯 HTML, 필터된 콘텐츠(`html`, `meta`), 위젯 HTML, 관리자 화면의 범용 설정 폼과 블록 기반 플러그인 페이지로만 나타납니다. `meta`는 어떤 형태든 견딥니다.
6. **콘텐츠 HTML**: `PublicContent.html`은 API가 스키마 검증 후 렌더링한 것이므로 그대로 `{@html}` 합니다. 프론트에서 Tiptap JSON을 직접 렌더링하지 않습니다.
7. **에디터 스키마**: 관리자 에디터는 반드시 `@cms/content`의 `contentExtensions`를 사용합니다. 확장을 추가하면 API 렌더러에도 자동 반영됩니다(같은 목록).
8. **폼 검증**: 가능하면 `@cms/sdk`의 같은 zod 스키마로 먼저 검증하고, API의 `CmsApiError`(4xx)는 `failFrom`으로 폼 오류로 변환합니다.
9. 슬러그 `admin`은 관리자 경로와 겹치므로 공개 콘텐츠에 쓰지 않습니다.
10. **사용자용 문구**: 화면·도움말·알림에서 제품 내부 동작이나 구현·개발 환경을 해명하는 문구를 쓰지 마세요. 예를 들어 “Docker 내부 값”, “개발용 기본값”, “설정 파일을 직접 편집할 필요 없음” 같은 설명은 노출하지 않습니다. 사용자가 입력하거나 수행할 일, 결과, 오류 해결에 필요한 안내만 간결하게 제공합니다. 개발·운영 세부사항은 개발자 문서에 둡니다.
11. **문구 카탈로그**: 관리자·테마 화면의 문구는 `#lib/i18n`(en, ko; 같은 키·같은 매개변수)에서 가져옵니다. 폼 action은 알림으로 카탈로그 키(`{ notice: 'saved' }`)를 돌려줍니다. 공개 테마는 사이트 언어(`site.locale`), 관리자 화면은 사용자 언어(없으면 사이트 언어)를 씁니다.
12. **저장하지 않은 변경**: 편집 화면(콘텐츠·메뉴·위젯·사이트 편집기)은 `confirmLeave`(`#lib/admin/unsaved.js`)로 떠나기 전에 묻습니다. 세션이 만료된 상태의 enhance 폼 요청(`x-sveltekit-action`)에는 로그인 링크가 보일 때 `hooks.server.ts`가 303 대신 설정된 공개 로그인 경로로 가는 action `redirect` 결과를 돌려주므로, 콘텐츠 편집기는 이를 가로채 입력을 유지하고 다시 로그인하도록 안내합니다(숨긴 경우에는 404). 본문은 `sessionStorage`에도 백업합니다. 백업(`#lib/admin/editor-backup.js`)은 사용자 id와 글별로 저장되고 24시간 뒤 만료되며, 저장 성공·로그아웃·다른 계정 로그인 시 지워집니다. 로그아웃 정리 표식은 HTTPS에서 `__Host-cms_signed_out`, HTTP에서 `cms_signed_out`을 쓰며 실제 스킴에 맞춰 생성·삭제합니다. HTTPS는 이전 이름의 표식을 신뢰하지 않습니다. 편집기 저장은 `expectedUpdatedAt`을 보내므로 그사이 다른 사람이 저장했으면 덮어쓰지 않고 충돌을 알립니다.
13. **알림과 오류**: 리디렉션 뒤에 보일 알림은 `?notice=<카탈로그 키>`(필요하면 `&undo=<콘텐츠 id>`)로 넘기며 `FlashNotice`가 카탈로그에 있는 키만 표시합니다. `failFrom`은 API 오류 `code`를 함께 돌려주고 `FormMessage`는 영어가 아닌 화면에서 코드·필드 경로를 카탈로그 문구로 바꿔 보여 줍니다(`#lib/admin/form-errors.js`). 관리자 문서 제목은 `페이지 ‹ 사이트 — CMS`로 자동으로 이어 붙습니다.

Plugin contributions render generically from API data, never by plugin id: plugin mail transports (`availableTransports`) become extra transport choices with fields generated from their declarations (`#lib/admin/settings/mail-transports.js`; secrets use `SecretField` and are never echoed), erasure reports list every eraser's counts/messages as plain text (`#lib/admin/erasure-report.js`), image size pickers list the media DTO's `variants` (`#lib/admin/image-sizes.js` labels unknown sizes by name), admin content rows with `inactiveType` show “비활성 유형”, the role editor labels capabilities from `roles.capabilities()` grouped by plugin source (keeping any a saved role still holds) and marks contributed roles, the block inserter lists `patterns.contributions()` by plugin, the menu editor offers `menus.types()` with an object picker (`menus.objects`) and plugin taxonomies, and the site editor shows plugin templates/parts (`readOnly`) as a read-only preview with Save disabled until the administrator chooses “사용자 지정”, which saves the current blocks as the administrator's own customization (`?/customize`; `saveTemplate`/`savePart` refuse read-only items with 409).

Discovery output goes through the plugin filter RPC before serialization (`#lib/server/seo-filter.js`, one `seo.filterBatch` per document): feeds and comment feeds (`feed.channel` + `feed.items`), robots.txt, llms.txt, `.md` views and page meta. Page loads add `seoMeta` (the `seo.meta` result, or null when unchanged or when no frontend secret is configured) through `withSeoMeta`/`withTemplateData`; the site layout applies it in `buildHead`, which still escapes everything. Each filter call (request and response body) is bounded by `SEO_FILTER_TIMEOUT_MS` (1500 ms) through a deadline-bound `fetch`, since the SDK transport takes no signal. Any failed or timed-out filter call (400/413, 403, 429, invalid plugin output as 502 `invalid_response`, other 5xx, network) serves the unfiltered value and logs `[seo] discovery filters skipped (<reason>)` once per reason per process; a plugin never breaks a public page.

Filtering runs only once the web server holds the frontend secret ([operations](../../docs/operations.md)): the same `CMS_FRONTEND_SECRET` on both servers, or automatic pairing on the first administrator sign-in, stored in `apps/web/data/frontend.secret`. Until then every filter call is skipped (`no frontend proof` is logged on the first discovery request). To check: the file exists (or the variable is set), and fetching `/robots.txt` logs no `[seo]` skip line. The sitemap index lists every `seo.providers()` kind.

App route links use `routeLink` (`#lib/route-link.js`): it resolves generated route IDs/params and derives native document navigation from `$app/manifest` capabilities. Pages retain CSR; routes with only `+server` use the framework's reload link option. Configured theme `LINK` attributes use the public server `$app/paths.match` and the same policy (`theme-links.ts`); never infer navigation from an extension, a social service, or a maintained endpoint list. Keep explicit page reloads only where server-state recovery requires them. Do not use the client matcher to classify documents: its dictionary contains pages only and the CMS catch-all can claim endpoint URLs.

## Public and admin DTO boundaries

- `PublicContent` and `PublicContentListQuery` are separate contracts from `ContentEntry` and `ContentListQuery`. Public responses exclude editor documents, author IDs, draft status, and creation timestamps. Public lists always select published content, regardless of supplied extra query parameters. A signed-in canonical single-entry read may additionally return private content after `authorize(actor, 'content.readPrivate')`, using the same public projection and `private, no-store` caching policy.
- Lists never carry bodies. `GET /api/v1/content` returns `PublicContentSummary` (`PublicContent` without `html`), read with a projection that does not fetch the body, and passed through the `content.publicSummary` filter. The admin list returns `AdminContentSummary` (no `document`/`html`). Single reads keep the full DTOs. Plugin `content.list` still returns `PublicContent` with `html`.
- Public taxonomy DTOs expose published-content counts only. Admin taxonomy DTOs include editing timestamps and counts across publication states. Content embeds only `TermSummary` (`id`, `name`, `slug`), not full term records.
- `PublicSiteDto` contains display settings only, including the effective public login path and whether themes show its link. `AdminUserDto`/`UserProfile` and `AdminPluginDto`/`PluginInfo` belong only to authenticated admin screens. Credentials, database configuration, session grants, and SSO transactions must never be returned from SvelteKit loads or form failures.
- SDK clients validate response DTOs at runtime before SvelteKit can serialize them. Malformed responses fail with `502 invalid_response`, without embedding the rejected payload in the error. Public content and plugin filter results use strict public schemas; other allowlist schemas strip undeclared properties.
- A TypeScript return annotation is not a projection. Domain mappers and server loads must explicitly select fields; never spread database records or `locals` into page data.
- Published content uses its own read port. Public pages retain the shared Prisma filter/order/count and ID-selection helpers, then hydrate a fixed parameterized SQL projection; detail reads use that projection directly. It joins only path, public author/media fields and the public-parent predicate, then batches assigned term summaries in a separate query (no JSON aggregation size limit). Both hydration queries recheck visibility and trash state; canonical path bytes pass through `decodePath` unchanged. Category/tag ordering still uses `termSummaries`; page/search/adjacent ordering is restored from the selected IDs. Summary SQL never selects bodies or stored fields. MariaDB does not support Prisma relation joins, so no preview feature is enabled.
- Published content uses its own read port and explicit projection. Filter publication state in the query and never fetch editor documents, search text, author IDs, or private SEO just to discard them. Keep the authoring repository separate; public and admin ports must not be interchangeable at the composition root.
- Plugin `meta` and HTML slots are intentionally extensible public output. A trusted plugin can publish anything it can access; DTO validation is not a sandbox for uploaded server code.
- Public browser code imports pure helpers from `@cms/sdk/format` or `@cms/sdk/tree`; type-only imports may use the root. Do not pull the schema barrel into a public bundle for a display helper. Server-side response validation remains mandatory.
- Avoid repeated hierarchy scans: index children once and traverse with a visited set. Slot rendering without providers performs no content/settings reads, and content pages fetch only their content-context slots. Do not optimize by caching authorization or personalized plugin HTML across requests.

## HTML·CSS·JS minify

압축은 빌드 때만 합니다. 브라우저 JS·CSS는 Vite의 Oxc·Lightning CSS가, 컴포넌트 마크업은 Svelte 컴파일러가 공백을 줄입니다. SSR HTML은 요청마다 렌더링되므로 런타임 minify를 하지 않습니다(요청별 CPU 비용, 스트리밍 차단). 본문 HTML·JSON-LD 같은 동적 출력은 압축되지 않으며, 전송 크기는 gzip/brotli(리버스 프록시)로 줄입니다.

## 테스트

웹 테스트와 픽스처는 `#web-test/*` alias를 씁니다([루트 코드 스타일](../../AGENTS.md#43-코드-스타일)). 테스트 판단 기준은 [루트 문서](../../AGENTS.md#테스트)를 따릅니다.
