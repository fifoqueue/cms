# SEO와 고유주소

상위 문서: [AGENTS.md](../../AGENTS.md)

## 크롤러와 에이전트 탐색

`/admin/seo`의 SEO 설정에는 다음 항목이 있습니다.

- `allowAiTraining`은 학습용 토큰(GPTBot, ClaudeBot, anthropic-ai, CCBot,
  Google-Extended, Applebot-Extended, Meta-ExternalAgent, Bytespider, cohere-ai,
  Amazonbot 등)을 제어합니다. `allowAiSearch`는 검색·사용자 요청 가져오기 토큰
  (OAI-SearchBot, Claude-SearchBot, PerplexityBot, ChatGPT-User,
  Claude-User, Perplexity-User 포함)을 제어합니다. 관리되는 목록은
  `apps/web/src/lib/server/seo-discovery.ts`의 `AI_BOTS`입니다.
- `aiBotOverrides`: 한 줄에 `Bot: allow` 또는 `Bot: disallow`를 하나씩 쓰며 대소문자를 구분하지 않습니다.
  `extraRobotsRules`: 길이가 제한된 robots 지시자·주석이며 HTML이나 제어
  문자는 쓸 수 없습니다. 그룹에 속하지 않은 추가 규칙은 명시적인 와일드카드 그룹에 들어가고,
  모든 추가 그룹은 비공개 경로 제외 규칙을 반복합니다. 추가 Allow 규칙은 생성된
  크롤 트랩 경로와 겹치지 않는 리터럴 접두사를 가져야 합니다. 여기에는 홈 검색
  `/?s=`(와 percent-encoded 비예약 문자 형태)가 포함됩니다. 생성과 검증은
  `packages/sdk/src/seo.ts`의 `SEO_ROBOTS_DISALLOW_PATHS`를 공유하며
  루트 `/`와 `/preview/theme/`는 예외입니다. 비공개 경로를 다시 열 수 있는
  모호한 와일드카드 접두사는 거부합니다.
  전역 색인 끄기는 이 설정보다 우선하며 크롤링을 막습니다.
  미리보기 토큰 경로와 홈 검색은 disallow 하고, `/preview/theme/`는 공개 CSS를 위해
  허용합니다. 설정을 불러오지 못하면 서버 오류 대신 짧게만 유효한 fail-closed
  robots 응답을 반환합니다. robots 규칙은 권고일 뿐 접근 제어가 아니며 권한을 부여하지 않습니다.
- `feedsEnabled`는 검색 색인과 독립적으로 `/feed.xml`과 `/feed.json`의 JSON Feed 1.1을
  발행합니다. 두 피드 모두 `?category=`, `?tag=`, `?author=`,
  `?taxonomy=<key>&term=<slug>`, `?archive=<type>`을 지원합니다. RSS는 고정된
  `urn:uuid:<id>` GUID, `lastBuildDate`, `atom:updated`, `atom:self`를 사용합니다.
  댓글 피드는 같은 피드 토글을 따르고, 탐색 대상이 아니거나 보호된 상위 항목을
  제외하며, `atom:self`를 포함하고, 60초 동안 공개 캐시됩니다.
- `indexNowEnabled`: 켜면 SEO 설정 트랜잭션 잠금 아래에서 영구적인 공개 소유권 키를
  생성합니다. 클라이언트는 이 키를 바꿀 수 없습니다. 사이트는 키를
  `/indexnow-key.txt`에서 제공하고 제출 요청에는 그 `keyLocation`을 지정합니다.
  발행된 변경, 이전 공개 경로, 휴지통 이동, 복원, 삭제는 코어 포트/HTTP 어댑터를
  통해 IndexNow에 알립니다. `webSubHub`는 `hub.mode=publish` / `hub.url`로 알리는
  피드인 `/feed.xml`에만 hub 링크를 추가합니다.
  범위를 좁힌 피드와 JSON Feed는 hub를 알리지 않습니다.
  전송은 최선 노력(best-effort) 방식이고 다른 처리를 막지 않으며 5초로 제한되고, 실패는
  각각 따로 로그에 남깁니다. 지속되는 재시도 큐는 아닙니다. 둘 다 기존
  `webhook` egress 서비스(SSRF/DNS 보호, HTTP 훅, 관리자가 관리하는 사설 네트워크
  예외 포함)를 사용합니다. 환경 설정이나 스키마 마이그레이션은 필요하지
  않습니다.

탐색 응답은 플러그인 필터링 뒤에 계산한 약한 ETag를 사용하고, 콘텐츠 타임스탬프가
있으면 Last-Modified도 보냅니다. 304는 If-None-Match가 일치하는 요청에만
반환합니다. Last-Modified는 설명용 값이며 필터링된 출력의 믿을 만한 단조 증가 버전이
아닙니다. 항목 제거, 설정·플러그인 변경으로 값이 그대로이거나 과거로 돌아갈 수
있습니다. 따라서 If-Modified-Since만 보낸 요청은 현재 본문을 받습니다.

사이트맵은 비밀번호로 보호된 항목을 제외합니다. 카테고리가 아닌 분류 보관함은
`indexTags`를 따릅니다. `archive` 제공자는 `archive: true`인 활성 유형 중 비어 있지 않은 것을 나열합니다.
용어는 하위 용어를 포함해 할당된 발행 콘텐츠의 가장 최근 수정 시각을 물려받습니다.
동적 `/`는 가장 최근의 탐색 가능 항목을 사용하고, 정적 홈은 다른 항목의 날짜를
빌리지 않고 lastmod를 생략합니다. 청크 인덱스 항목에는 그 청크의 최신 타임스탬프가
들어갑니다. 콘텐츠 청크는 UUIDv7 오름차순을 유지합니다. 이 ID는 시간순이므로
새로 추가해도 이전 청크가 뒤섞이지 않습니다. 다만 항목이 제거되면 오프셋 기반
페이지가 당겨질 수 있습니다. 사이트맵 쿼리의 `sort=modified`는 제한된 홈
타임스탬프 조회에 쓰이며 기본 청크 정렬은 `stable`입니다.
이미지 확장에는 대표 이미지와 본문의 미디어 라이브러리 이미지가 들어가고, 플러그인은
`sitemap.entries`로 외부 이미지 URL과 언어 대체본을 추가할 수 있습니다.
이미지가 많은 API 페이지는 이스케이프와 XML 외곽 요소를 포함한 압축 전 UTF-8 XML이
최대 50 MiB가 되도록 항목 단위로 나눕니다. 첫 부분은
`/sitemaps/<kind>/<page>.xml`을 유지하고 추가 부분은 `?part=2`, `?part=3` 등을 사용하며,
인덱스가 모든 부분을 나열합니다. 항목마다 이미지는 여전히 최대 1,000개이며,
한도를 넘는 단일 항목이나 인덱스는 URL을 조용히 빼지 않고 실패합니다.
읽기 설정을 불러오지 못하면 정적 홈 URL을 중복 발행하지 않고 그 청크를
실패시킵니다.

`/llms.txt`에는 H1, 인용 블록 요약과 Pages, Recent posts, Topics,
Optional 링크 섹션이 있습니다. `/llms-full.txt`는 Markdown 문서 전체를 이어 붙이며
최대 200개 항목, 요약 2,000개 검사, 512,000 UTF-8 바이트로 제한됩니다. 보호된 항목,
noindex 항목, 정식 URL이 다른 사이트를 가리키는 항목은 제외하며, 본문을 불러올 때
보호 여부를 다시 확인합니다. 한도를 넘는 항목은 나누지 않고 생략합니다. 이 파일은
제한된 읽기 보조 자료이며 완전한 내보내기를 보장하지 않습니다. 두 파일 모두
색인/llms 토글을 따릅니다. `llms-full.txt`, `feed.json`, `indexnow-key.txt`는 예약된
보관함 기준 경로입니다.

Topics는 사이트맵에서 보호 항목을 걸러 낸 카테고리 데이터를 사용하며, 하위 카테고리를
포함해 보호되지 않은 발행 콘텐츠의 서로 다른 할당 수(`sort=popular`) 순으로 정렬합니다.
피드·llms의 최근 항목 목록은 최종 개수 제한 전에 필터링하며, 유형마다 100개 단위
배치를 최대 20번 검사합니다. 이 예산을 다 쓰면 더 적은 항목을 반환할 수 있습니다.

Markdown은 GFM 표·작업 목록과 미디어·임베드 원본 링크를 보존합니다. YAML
frontmatter는 title, canonical, published, updated, author, categories, tags, type,
lang, description에 JSON 따옴표 형식의 YAML 스칼라·배열을 사용합니다. 글쓴이 표기가
없으면 공개 글쓴이를 사용하고, `lang`은 사이트 로캘에서 가져옵니다.

head 통합은 피드 자동 탐색에 색인 플래그가 아닌 `feedsEnabled && siteUrl`을
사용하고, `/feed.json`의 `application/feed+json`을 알리며, 사용자 지정 분류와
콘텐츠 유형 보관함의 대체 링크에는 `feedPath`를 사용합니다.

## 페이지별 메타데이터

`apps/web/src/lib/seo/head.ts`는 SSR과 클라이언트 이동에 같은 메타데이터를 만듭니다.
홈 제목·설명은 정적 첫 페이지를 포함해 `/`에 적용하며, 홈 제목에는 제목 템플릿을
씌우지 않습니다. 글 목록 페이지는 대신 그 항목의 SEO를 사용합니다.
암묵적인 article 전용 홈은 `/`를 유지하고, 명시적인 `?type=article`은 별개로 취급합니다.
페이지 나눔과 분할된 항목의 각 부분은 각자의 제목, 설명, 정식 URL을 받습니다.

Article은 글쓴이와 이미지가 없으면 공개 글쓴이(`/author/<slug>#person`)와 대표 이미지를 사용합니다.
글쓴이 ProfilePage 노드는 같은 Person 식별자, 소개, 공개 아바타를 사용합니다.
공유 이미지는 편집기 미리보기를 포함해 항목 SEO, 대표 이미지, 사이트 기본값 순으로
고릅니다. 대표 이미지는 1200px에 가장 가까운 크기와 알려진 크기·MIME·alt를
사용합니다. 반응형 크기는 종횡비를 유지하며 head는 16:9, 4:3, 정사각형 자르기를
임의로 만들지 않습니다. 외부 SEO 이미지 URL에도 크기를 임의로 붙이지 않습니다.
CollectionPage 목록은 현재 페이지의 항목만 설명합니다. CollectionPage는
항목 재정의 값이 아닙니다. 이전에 저장된 값은 WebPage로 읽고 새로 저장할 때는 거부합니다.

이동 경로(breadcrumb)는 공개 페이지의 상위 항목과 용어의 상위 항목을 사용하며 설정된
보관함 기준 경로를 따릅니다. 비밀번호 보호, 비공개, 휴지통 상위 항목은 노출하지 않습니다.
마지막 이동 경로 URL은 페이지 번호를 포함해 표시 중인 페이지를 가리킵니다.
BreadcrumbList는 선택한 템플릿이나 그 템플릿이 포함한 파트에 보이는
breadcrumbs 블록이 있을 때만 출력하며, 그 블록이 없는 journal 템플릿은 출력하지 않습니다.
정적 첫 페이지에는 중복 루트 이동 경로가 없습니다.

SEO 설정에는 대체 사이트 이름, 사이트 핸들과 기본 creator 핸들,
글쓴이·콘텐츠 유형 보관함 재정의(종류와 글쓴이 슬러그 또는 유형 키, 제목,
설명, 이미지, noindex)가 있습니다. 재정의는 `seo` 설정 레코드에 저장하고
`/admin/seo`에서 편집하며 명시적인 공개 허용 목록을 사용합니다.
글쓴이 프로필에는 소셜 링크 필드가 없으므로 creator는 설정된 기본 글쓴이
핸들을, 그다음 사이트 핸들을 사용합니다.

항목은 상속 또는 명시적인 max-snippet/max-image-preview와 nosnippet을 지원합니다.
추가 전용 마이그레이션 `20261105052331_seo_snippet_controls`가 이 값을 콘텐츠와
용어에 저장합니다. 허용되는 schema 선택지는 Article, BlogPosting, NewsArticle, TechArticle,
WebPage, AboutPage, ContactPage이며, 임의의 본문에서 FAQ 마크업을
추론하지 않습니다. Article의 headline, 날짜, 알려진 글쓴이·이미지, publisher는
값이 있을 때 출력합니다. Google은 이 Article 속성을 권장하지만 필수
Article 필드는 없습니다. TechArticle은 유효한 schema.org 유형이지만 Google 리치 결과를 약속하지는 않습니다.
ProfilePage는 필수인 이름 있는 mainEntity를 제공합니다.

보호된 항목은 잠금 해제한 화면을 포함해 noindex입니다. 잠긴 공개 프로젝션은
SEO·소셜 설명과 자동 요약을 숨기며, 그 head는 발췌나 사이트·홈 설명으로
대체하지 않습니다. 잠금 해제가 증명된 응답과 인가된 서명 미리보기는 정적 첫 페이지와
글 목록 페이지를 포함해 설명을 유지합니다. `protected`는 응답의 잠김 상태를 나타내며,
영속적인 `passwordProtected` 플래그는 잠금 해제 뒤에도 noindex를 유지합니다. 익명 목록과
탐색 출력은 잠금 해제 증명을 받지 않으므로 잠김 정책을 유지합니다.
저장할 때 인가된 읽기를 위해 생성된 요약은 보존하되 보호된 검색 텍스트는 비워 둡니다.
기존의 빈 요약은 다음 저장 때 다시 생성합니다.
오류 페이지는 오류 제목과 noindex를 가집니다.
Markdown 대체본에는 설정된 origin, 색인 허용, 보호되지 않은 항목,
자기 자신을 가리키는 정식 URL이 필요합니다. Markdown 라우트, head, `Link` 헤더는
`apps/web/src/lib/seo/paths.ts`의 `markdownDiscoverable`로 이 규칙을 공유하며
정적 첫 페이지는 `/`로 해석합니다. 설정된 origin이 없으면 head는 정식 URL,
og:url, 대표 이미지 URL을 임의로 만들지 않으며, 관리자 설정 페이지가 이 누락을 경고합니다.

정식 공개 항목 URL은 `Accept: text/markdown`의 실효 품질 값이 `text/html`보다
높을 때 Markdown으로도 협상합니다. 구체적인 범위가 와일드카드보다 우선하고,
`q=0`은 그 표현을 제외하며, 품질 값이 같으면 HTML을 유지합니다. 훅은
`/[slug].md` 핸들러를 호출하므로 그 필터, 보호·탐색 가능 여부 검사,
본문, 캐시 정책, ETag를 그대로 따릅니다. 두 표현 모두 304를 포함해 `Vary: Accept`를 보냅니다.
프록시는 이 헤더를 보존하고 변형 선택에 Accept를 포함해야 합니다.
HTML 항목은 `Link: <…/slug.md>; rel="alternate"; type="text/markdown"`도 보냅니다.
데이터 요청, 미리보기, 로그인 화면, 목록은 항목으로 협상하지 않습니다.

## 공개 HTML과 링크

공개 HTML 검증자와 프록시 쿠키 우회 조건은 [운영 문서](../operations.md#공개-html-압축과-캐시)를 참고하세요.
`__data.json`, API·관리·미리보기 내부 응답에는 `X-Robots-Tag: noindex, nofollow`를,
RSS/Atom/JSON Feed에는 `noindex, follow`를 적용합니다. 미디어는 이미지뿐 아니라 PDF도
기본으로 색인할 수 있으며 미디어 전체를 noindex로 막지 않습니다.

목록의 첫 페이지 링크는 `page=1`을 생략하며 일별 보관함의 페이지 이동은
연·월·일을 유지합니다. 댓글 답글 링크는 기능을 유지하되 nofollow입니다.
`archive/<type>` 및 날짜 보관함은 끝 슬래시 없는 주소로 정규화합니다.

테마 group은 `article` 태그를 지원하며 쿼리 루프의 각 항목은 article로 묶습니다.
Canvas와 Journal의 기본 single/page 템플릿도 본문을 article로 묶고
기본 single 템플릿에는 관련 글을 배치합니다. 저장된 사용자 지정 템플릿은 덮어쓰지 않습니다.
`related-posts` 블록은 선택한 분류(category 또는 tag)를 공유하는 같은 유형의
게시물로 연결합니다. 현재 글과 잠긴 글은 제외하고 여러 분류의 중복 결과는
한 번만 표시합니다. 각 분류에서 최대 count개를 읽어 최신순으로 합친 뒤
최대 count개를 SSR 링크로 표시합니다. 공통 분류가 없으면 표시하지 않습니다.

본문 이미지의 대체 텍스트가 비어 있으면 읽을 때 미디어 라이브러리의 최신 값으로
채웁니다. 빠진 width와 height도 각각 보충합니다. 문서가 지정한 대체 텍스트와
크기는 보존합니다. Cover와 단일 글의 SEO 대체 이미지는 eager/high priority입니다.
테마 Image/Cover/Media & Text와 SEO 대체 이미지는 공개 미디어 메타데이터를 조회해
라이브러리의 width/height/srcset을 사용합니다. Image와 Media & Text는 lazy입니다.
등록되지 않은 외부 이미지의 크기를 추측하거나 그 서버로 메타데이터 요청을 보내지 않습니다.

공개 본문은 SSR DOM에 한 번만 기록합니다. SvelteKit transport의 `HtmlBody`는 실제로
렌더링된 본문을 hydration 때 DOM에서 복구합니다. 클라이언트 이동과 본문을 표시하지
않는 템플릿에는 원문을 전송합니다. 브라우저가 정규화한 동등한 HTML을 복구하므로
이 `{@html}`의 문자열 차이 경고만 억제하고 DOM은 그대로 둡니다.
오류 템플릿·파트·쿼리는 정상 레이아웃 데이터에 넣지 않고 Kit 3 `handleError`에서
그 오류 상태에 필요한 것만 불러옵니다. 404/410은 404 템플릿, 다른 오류는 500 템플릿을
우선하며 없으면 index 템플릿을 사용합니다.

고유주소의 저장과 충돌 검사는 바이트 단위입니다. 정확한 경로와 끝 슬래시
변형이 없을 때만 ASCII 대소문자 변형을 조회해 유일한 소유자에게 리디렉션합니다.
여러 저장 경로가 일치하면 추측하지 않고 404로 남깁니다. 악센트나 percent-encoded
비ASCII 문자는 접지 않습니다. ASCII 소문자 경로의 SHA-256인 `folded_hash` 색인을
쓰며 해시로 조회한 뒤 실제 경로도 비교합니다. 정식 소유권은 바이트 단위로 비교합니다.

각 경로의 `was_public`으로 공개 이력을 기록합니다. 과거에 발행된 글이라도
초안으로 되돌린 뒤 만든 주소에는 공개 이력이 없습니다. 휴지통·영구 삭제 뒤에도
그 주소는 404이며 공개 이력이 있는 주소만 410입니다. 발행·예약 발행·공개 글 복원과
공개 상태의 경로 변경에서 실제로 공개되는 경로를 같은 트랜잭션 안에서 기록합니다.
영구 삭제는 검증된 공개 경로만 `content_tombstones`에 남깁니다.
알 수 없는 경로는 404입니다. 공개 이력을 검증할 수 없는 이전 데이터도 404입니다.
새 소유자가 경로를 다시 사용하면 새 소유자가 우선합니다. 마이그레이션 전에
삭제된 경로는 복구할 수 없어 404를 유지합니다. API의 `gone`(410)은 웹에서도 410입니다.

`content.permalink`는 그 항목이 이미 소유한 현재 경로나 별칭 경로만 선택할 수 있습니다. 라우팅되지 않은 경로나 다른 항목이 소유한 경로를 선택하면 거부하고 훅 버스에 기록합니다. 새로운 형태의 경로는 쓰기 시 충돌 검사가 유지되도록 고유주소 토큰을 사용해야 합니다. 소유한 별칭을 선택하면 자기 자신으로 리디렉션하지 않고 그 별칭을 그대로 제공합니다.

고유주소 템플릿에는 플러그인 토큰 식별자를 넣을 수 있습니다. 콘텐츠 저장, 분류 변경, 글쓴이 프로필 변경, 개인정보 삭제, 고유주소 설정에 따른 재생성은 트랜잭션 충돌 검사 전에 이 토큰을 해석합니다. 사용자 지정 토큰이 빠져 경로 구조가 올바르지 않게 되면 그 항목의 슬러그 경로로 대신 계산합니다. 플러그인을 비활성화해도 저장된 현재 경로는 그대로 남습니다. 재생성은 대체 경로를 사용하고 이전에 공개되었던 경로는 리디렉션으로 유지합니다.

설정에 따른 재생성은 배치당 최대 200개 항목을 검사합니다. 플러그인 해석은 트랜잭션 밖에서 총 5초의 예산 안에 실행됩니다. 각 쓰기 배치는 경로 잠금 아래에서 입력 스냅샷을 다시 확인한 뒤 기존 충돌 검사를 실행하고 지속되는 커서를 원자적으로 앞으로 옮깁니다. 같은 설정으로 다시 시도하면 이어서 진행하고 다른 설정을 제출하면 검사를 처음부터 다시 시작합니다. 진행 상황과 완료는 로그에 남깁니다. 재생성이 대기 중인 동안 경쟁하는 경로 쓰기는 충돌을 반환합니다. 중단되어도 이미 커밋된 배치는 유지됩니다. 설정은 검사가 끝난 뒤에만 게시합니다. 원자성은 배치 단위로만 보장하며 사이트 전체를 롤백하지는 않습니다.

용어 변경, 글쓴이 이름 변경·재지정, 개인정보 삭제는 메타데이터 트랜잭션 안에서 영향받는 콘텐츠 ID를 큐에 넣기만 합니다. 트랜잭션 안에서는 토큰 해석기를 호출하지 않습니다. 임대(lease)된 스케줄러 작업이 재시작 뒤에도 5초마다 지속 작업을 이어서 처리합니다. 이 작업은 같은 배치·예산·충돌 검사·진행 로그를 사용합니다. 그 배치가 커밋될 때까지 기존 경로를 계속 제공합니다. 재생성이 실패해도 이미 커밋된 메타데이터는 롤백하지 않습니다.

탐색 제공자는 코어의 콘텐츠·분류·글쓴이 제공자를 포함해 SDK의 사이트맵 레지스트리로 확장할 수 있습니다. 웹 사이트맵 인덱스는 고정된 제공자 목록을 두지 않고 `/api/v1/seo/providers`를 열거해야 합니다. 사이트맵 페이지는 필터링을 마친 항목을 담습니다. 피드·채널, 크롤러 텍스트, 메타데이터 직렬화기는 이스케이프 전에 인증된 `/api/v1/seo/filter` RPC를 사용합니다. 웹 통합은 API 계약과 별개입니다. API는 웹사이트의 최종 XML이나 HTML을 직렬화하지 않습니다.

Markdown 직렬화기는 `.md` 응답을 반환하기 전에 렌더링한 공개 텍스트를 같은 신뢰된 프런트엔드 RPC로 `seo.markdown`에 제출합니다. 웹 라우팅과 직렬화에 공유 타입 계약이 생기기 전까지 피드 유형은 등록할 수 없습니다. 기존 콘텐츠·댓글 피드는 항목·채널 필터로 계속 확장할 수 있습니다.

- SEO는 설치된 플러그인과 선택한 테마에 독립적인 코어 기능입니다. 설정과 콘텐츠·용어 메타데이터는 `@cms/sdk`로 검증합니다. 전역 설정에는 게시해도 되는 메타데이터와 크롤러 정책만 담습니다. 분석 자격 증명이나 제공자 비밀 값은 담으면 안 됩니다.
- `AdminEntrySeo.focusKeyword`는 편집용 데이터이며 공개 메타데이터가 아닙니다. 공개 콘텐츠, 분류, 탐색, 페이지 데이터, JSON-LD, 피드, Markdown은 공개 SEO 허용 목록을 사용해야 합니다. 콘텐츠·용어 업데이트에서 `seo`를 생략하면 저장된 SEO를 지우지 않고 유지합니다.
- 공개 페이지는 하나의 권위 있는 SSR 메타데이터 집합을 렌더링합니다: 제목·설명, 정식 URL, robots 지시자, OpenGraph/Twitter, 이스케이프된 JSON-LD. 구조화 데이터는 화면에 보이는 콘텐츠를 설명해야 합니다. 조작된 평점, 글쓴이, FAQ, 순위 보장은 허용되지 않습니다. 코어 라우팅 식별자와 SEO 정책은 `content.public` 필터로 덮어쓸 수 없습니다.
- 절대 정식·탐색 URL은 설정된 공개 `siteUrl`에서만 가져오며 요청의 Host 헤더에서는 가져오지 않습니다. 설정이 없을 때 localhost URL을 만들어 내면 안 됩니다. 검색 페이지와 빈 아카이브는 색인할 수 없습니다. `noindex`는 접근 제어가 아니므로 페이지는 계속 공개됩니다. 크롤러가 이 지시자를 읽을 수 있어야 합니다.
- 사이트맵은 전체 편집기 문서나 HTML 대신 게시 콘텐츠의 가벼운 프로젝션을 페이지로 나눠 사용합니다. 초안, `noIndex` 항목, 다른 URL을 정식 URL로 지정한 항목은 제외합니다. 색인·카테고리·태그 설정은 메타데이터와 탐색 전반에 일관되게 적용됩니다.
- `llms.txt`는 선택적인 탐색 제안일 뿐 순위 기능이 아닙니다. Markdown 대체본은 게시된 콘텐츠만 담고 실제 정식 URL을 가리킵니다. 편집용 JSON이나 비공개 메타데이터는 노출하면 안 됩니다. AI 검색 크롤러 제어와 학습 크롤러 제어는 서로 독립적입니다.
- 고유주소는 콘텐츠 유형(`post`, `article`, `page`)마다 따로 설정합니다. 기본값 `/%slug%`는 기존 URL을 유지합니다. 토큰은 `%year%`, `%month%`/`%monthnum%`, `%date%`/`%day%`, `%hour%`, `%minute%`, `%second%`, `%title%`, `%slug%`/`%postname%`, `%id%`/`%post_id%`, `%category%`, `%author%`, `%pagename%`을 포함합니다. 새로 저장할 때 날짜는 사이트 시간대를 사용합니다. `%title%`은 슬러그화하지 않고 `encodeURIComponent(title)`을 사용합니다.
- `/p/%year%%month%%date%`는 `/p/20261022`를 만들고 `/post/%title%`은 인코딩된 제목 URL을 만듭니다. 날짜만 있는 템플릿은 충돌할 수 있습니다. 충돌하면 원자적으로 거부합니다. URL을 조용히 바꾸거나 엉뚱한 항목을 제공하지 않습니다. 관리·탐색 경로는 예약해 두고 경로 탐색(traversal), 외부 URL, 지원되지 않는 토큰은 거부합니다.
- 정식 콘텐츠 경로와 그 이력은 영속적인 라우팅 데이터에 속합니다. 클라이언트 측에서 추측하지 않습니다. 콘텐츠 링크, SEO, 피드, 사이트맵, 미리보기는 같은 경로를 사용해야 합니다. 기존 별칭은 최신 게시 경로로 바로 리디렉션합니다. 초안과 삭제된 항목은 공개적으로 해석되지 않습니다.
- 참고: [Google AI 기능](https://developers.google.com/search/docs/appearance/ai-features), [Article 구조화 데이터](https://developers.google.com/search/docs/appearance/structured-data/article), [robots 지시자](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [OpenGraph](https://ogp.me/), [사이트맵](https://www.sitemaps.org/protocol.html), [OpenAI 크롤러](https://developers.openai.com/api/docs/bots), [llms.txt 제안](https://llmstxt.org/), [WordPress 고유주소](https://wordpress.org/documentation/article/customize-permalinks/).
