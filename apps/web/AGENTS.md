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
3. **세션**: 로그인 시 받은 토큰을 HTTPS에서는 host-bound httpOnly 쿠키(`__Host-cms_session`), 평문 HTTP(로컬 개발 포함)에서는 별도 이름 `cms_session`에 저장하고 `Authorization: Bearer`로 전달합니다. HTTPS는 이전 이름을 인증이나 마이그레이션에 사용하지 않으므로 전환 뒤 한 번 다시 로그인해야 합니다. 진행 중인 로그인(모든 방식의 단계·초대 링크 설정·2단계 인증 등록·SSO 연결)은 쿠키 하나(`#lib/server/sso-cookie.js`, HTTPS는 `__Host-cms_sso`만, HTTP는 `cms_sso`)에 두며 트랜잭션 핸들은 페이지 데이터에 넣지 않습니다. 로그인 화면·초대 링크 화면은 API가 준 방식 설명을 그대로 그리며 플러그인 id로 분기하지 않습니다([로그인](../../docs/auth/sign-in.md#웹)). `/admin` 보호는 `hooks.server.ts` 한 곳에서 합니다. 로그인 화면은 관리자 설정의 공개 경로(기본 `/login`)에서 직접 렌더링·제출하며 `/admin/login`은 존재하지 않습니다. 로그인 링크를 숨기면 로그아웃 상태의 보호된 관리자 요청은 캐시 불가능한 404가 되고, 알 수 없는 `/admin/*` 주소도 인증 리디렉션으로 바뀌지 않습니다. 링크가 보일 때만 보호된 관리자 GET을 공개 로그인 경로로 보냅니다. 로그인 후 `returnPath`(`#lib/server/return-path.js`)는 정규화된 같은 사이트의 공개/관리 경로만 허용하고 인증 경로·외부 주소는 대시보드로 바꿉니다. 비밀번호와 SSO 로그인이 같은 목적지를 사용합니다.
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

플러그인 기여분은 플러그인 id가 아니라 API 데이터를 기준으로 범용적으로 렌더링합니다. 플러그인 메일 전송 수단(`availableTransports`)은 선언에서 생성한 필드와 함께 추가 전송 수단 선택지가 됩니다(`#lib/admin/settings/mail-transports.js`, 비밀 값은 `SecretField`를 쓰며 다시 노출하지 않습니다). 플러그인 미디어 저장소 드라이버(`media.storage.get().availableDrivers`)는 같은 방식으로 생성한 필드와 함께 설정 → 미디어 저장소의 추가 선택지가 됩니다(`#lib/admin/settings/storage-drivers.js`, `readPluginFields`, `pluginSettings.<key>` 오류는 해당 필드 아래에 표시). 개인정보 삭제 처리 보고서는 모든 개인정보 삭제 처리기의 개수/메시지를 일반 텍스트로 나열합니다(`#lib/admin/erasure-report.js`). 이미지 크기 선택기는 미디어 DTO의 `variants`를 나열합니다(`#lib/admin/image-sizes.js`는 알 수 없는 크기를 이름으로 표시). `inactiveType`이 있는 관리자 콘텐츠 행은 “비활성 유형”을 표시합니다. 역할 편집기는 `roles.capabilities()`의 권한을 플러그인 출처별로 묶어 표시하고(저장된 역할이 여전히 가진 권한도 유지) 기여된 역할에 표시를 붙입니다. 블록 삽입기는 `patterns.contributions()`를 플러그인별로 나열하고, 메뉴 편집기는 `menus.types()`를 객체 선택기(`menus.objects`) 및 플러그인 분류와 함께 제공하며, 사이트 편집기는 플러그인 템플릿/파트(`readOnly`)를 읽기 전용 미리보기로 보여 주고 관리자가 “사용자 지정”을 선택하기 전까지 저장을 비활성화합니다. “사용자 지정”은 현재 블록을 관리자 자신의 커스터마이징으로 저장합니다(`?/customize`, `saveTemplate`/`savePart`는 읽기 전용 항목을 409로 거부).

탐색(discovery) 출력은 직렬화 전에 플러그인 필터 RPC를 거칩니다(`#lib/server/seo-filter.js`, 문서마다 `seo.filterBatch` 한 번). 대상은 피드와 댓글 피드(`feed.channel` + `feed.items`), robots.txt, llms.txt, `.md` 뷰, 페이지 메타입니다. 페이지 load는 `withSeoMeta`/`withTemplateData`를 통해 `seoMeta`(`seo.meta` 결과이며, 변경이 없거나 프런트엔드 비밀이 설정되지 않았으면 null)를 추가하고, 사이트 레이아웃은 이를 `buildHead`에서 적용하며 `buildHead`는 여전히 모든 값을 이스케이프합니다. SDK 전송 계층은 signal을 받지 않으므로, 각 필터 호출(요청과 응답 본문)은 기한이 걸린 `fetch`로 `SEO_FILTER_TIMEOUT_MS`(1500ms) 안에 끝나야 합니다. 실패하거나 시간 초과된 필터 호출(400/413, 403, 429, 잘못된 플러그인 출력으로 인한 502 `invalid_response`, 그 밖의 5xx, 네트워크 오류)은 필터링하지 않은 값을 제공하고 `[seo] discovery filters skipped (<reason>)`을 프로세스당 사유별로 한 번 기록합니다. 플러그인이 공개 페이지를 깨뜨려서는 안 됩니다.

필터링은 웹 서버가 프런트엔드 비밀을 가진 뒤에만 동작합니다([운영](../../docs/operations.md)). 두 서버에 같은 `CMS_FRONTEND_SECRET`을 두거나, 첫 관리자 로그인 때 자동으로 짝을 맺어 `apps/web/data/frontend.secret`에 저장합니다. 그 전에는 모든 필터 호출을 건너뜁니다(첫 탐색 요청에서 `no frontend proof`가 기록됩니다). 확인 방법: 파일이 있거나 변수가 설정되어 있어야 하며, `/robots.txt`를 요청했을 때 `[seo]` 건너뜀 로그가 남지 않아야 합니다. 사이트맵 인덱스는 모든 `seo.providers()` 종류를 나열합니다.

앱 라우트 링크는 `routeLink`(`#lib/route-link.js`)를 씁니다. 생성된 라우트 ID/파라미터를 해석하고 `$app/manifest` 기능에서 네이티브 문서 이동 여부를 도출합니다. 페이지는 CSR을 유지하며, `+server`만 있는 라우트는 프레임워크의 reload 링크 옵션을 씁니다. 설정된 테마의 `LINK` 속성은 공개 서버의 `$app/paths.match`와 같은 정책(`theme-links.ts`)을 씁니다. 확장자, 소셜 서비스, 따로 관리하는 엔드포인트 목록으로 이동 방식을 추측하지 마세요. 명시적인 페이지 새로고침은 서버 상태 복구에 필요한 곳에만 둡니다. 클라이언트 matcher로 문서를 분류하지 마세요. 그 사전에는 페이지만 들어 있고 CMS의 catch-all이 엔드포인트 URL을 가로챌 수 있습니다.

## 공개·관리자 DTO 경계

- `PublicContent`와 `PublicContentListQuery`는 `ContentEntry`, `ContentListQuery`와 별개의 계약입니다. 공개 응답은 에디터 문서, 작성자 ID, 초안 상태, 생성 시각을 제외합니다. 공개 목록은 추가 쿼리 파라미터가 주어져도 항상 발행된 콘텐츠만 선택합니다. 로그인한 상태의 정식 단일 항목 읽기는 `authorize(actor, 'content.readPrivate')` 이후에 비공개 콘텐츠도 반환할 수 있으며, 이때도 같은 공개 프로젝션과 `private, no-store` 캐시 정책을 씁니다.
- 목록에는 본문을 싣지 않습니다. `GET /api/v1/content`는 본문을 가져오지 않는 프로젝션으로 읽은 `PublicContentSummary`(`html`이 없는 `PublicContent`)를 반환하며 `content.publicSummary` 필터를 거칩니다. 관리자 목록은 `AdminContentSummary`(`document`/`html` 없음)를 반환합니다. 단일 읽기는 전체 DTO를 유지합니다. 플러그인 `content.list`는 여전히 `html`이 있는 `PublicContent`를 반환합니다.
- 공개 분류 DTO는 발행된 콘텐츠 개수만 노출합니다. 관리자 분류 DTO는 편집 시각과 발행 상태 전체에 걸친 개수를 포함합니다. 콘텐츠에는 전체 분류 레코드가 아니라 `TermSummary`(`id`, `name`, `slug`)만 포함합니다.
- `PublicSiteDto`는 표시 설정만 담으며, 유효한 공개 로그인 경로와 테마가 그 링크를 보여 줄지 여부를 포함합니다. `AdminUserDto`/`UserProfile`과 `AdminPluginDto`/`PluginInfo`는 인증된 관리자 화면에만 속합니다. 자격 증명, 데이터베이스 설정, 세션 부여 정보, SSO 트랜잭션은 SvelteKit load나 폼 실패에서 절대 반환해서는 안 됩니다.
- SDK 클라이언트는 SvelteKit이 직렬화하기 전에 응답 DTO를 런타임에 검증합니다. 형식이 잘못된 응답은 거부된 페이로드를 오류에 담지 않고 `502 invalid_response`로 실패합니다. 공개 콘텐츠와 플러그인 필터 결과는 엄격한 공개 스키마를 쓰고, 그 밖의 허용 목록 스키마는 선언되지 않은 속성을 제거합니다.
- TypeScript 반환 타입 표기는 프로젝션이 아닙니다. 도메인 매퍼와 서버 load는 필드를 명시적으로 선택해야 하며, 데이터베이스 레코드나 `locals`를 펼쳐서 페이지 데이터에 넣지 마세요.
- 발행된 콘텐츠는 자체 읽기 포트를 씁니다. 공개 페이지는 공유 Prisma 필터/정렬/개수 및 ID 선택 헬퍼를 유지한 채 고정된 파라미터화 SQL 프로젝션으로 데이터를 채우고, 상세 읽기는 그 프로젝션을 바로 씁니다. 이 프로젝션은 경로, 공개 작성자/미디어 필드, 공개 부모 조건만 조인하고, 지정된 분류 요약은 별도 쿼리로 일괄 조회합니다(JSON 집계 크기 제한 없음). 두 조회 쿼리 모두 공개 여부와 휴지통 상태를 다시 확인하며, 정식 경로 바이트는 `decodePath`를 변환 없이 통과합니다. 카테고리/태그 정렬은 여전히 `termSummaries`를 쓰고, 페이지/검색/인접 항목 정렬은 선택된 ID에서 복원합니다. 요약 SQL은 본문이나 저장된 필드를 절대 선택하지 않습니다. MariaDB는 Prisma 관계 조인을 지원하지 않으므로 해당 프리뷰 기능은 켜지 않습니다.
- 발행된 콘텐츠는 자체 읽기 포트와 명시적 프로젝션을 씁니다. 발행 상태는 쿼리에서 필터링하고, 에디터 문서, 검색 텍스트, 작성자 ID, 비공개 SEO를 가져온 뒤 버리는 일은 하지 마세요. 작성용 저장소는 분리해 두며, 공개 포트와 관리자 포트는 컴포지션 루트에서 서로 바꿔 쓸 수 없어야 합니다.
- 플러그인 `meta`와 HTML 슬롯은 의도적으로 확장 가능한 공개 출력입니다. 신뢰된 플러그인은 접근할 수 있는 모든 것을 게시할 수 있으며, DTO 검증은 업로드된 서버 코드를 위한 샌드박스가 아닙니다.
- 공개 브라우저 코드는 `@cms/sdk/format` 또는 `@cms/sdk/tree`에서 순수 헬퍼를 import 합니다. 타입 전용 import는 루트를 써도 됩니다. 표시용 헬퍼 하나 때문에 스키마 배럴을 공개 번들에 끌어오지 마세요. 서버 측 응답 검증은 계속 필수입니다.
- 계층 구조를 반복해서 훑지 마세요. 자식을 한 번 색인하고 방문 집합(visited set)으로 순회합니다. 제공자가 없는 슬롯 렌더링은 콘텐츠/설정을 읽지 않으며, 콘텐츠 페이지는 자기 콘텐츠 컨텍스트 슬롯만 가져옵니다. 요청 간에 권한 판정이나 개인화된 플러그인 HTML을 캐시해 최적화하지 마세요.

## HTML·CSS·JS minify

압축은 빌드 때만 합니다. 브라우저 JS·CSS는 Vite의 Oxc·Lightning CSS가, 컴포넌트 마크업은 Svelte 컴파일러가 공백을 줄입니다. SSR HTML은 요청마다 렌더링되므로 런타임 minify를 하지 않습니다(요청별 CPU 비용, 스트리밍 차단). 본문 HTML·JSON-LD 같은 동적 출력은 압축되지 않으며, 전송 크기는 gzip/brotli(리버스 프록시)로 줄입니다.

## 테스트

웹 테스트와 픽스처는 `#web-test/*` alias를 씁니다([루트 코드 스타일](../../AGENTS.md#43-코드-스타일)). 테스트 판단 기준은 [루트 문서](../../AGENTS.md#테스트)를 따릅니다.
