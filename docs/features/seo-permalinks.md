# SEO와 고유주소

상위 문서: [AGENTS.md](../../AGENTS.md)

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
- API 계약: `GET /api/v1/seo`(공개 설정), `GET/PUT /api/v1/admin/seo`(인증된 설정), `GET /api/v1/seo/sitemap?kind=content|category|tag&page=&pageSize=`(범위가 제한된 탐색), `GET /api/v1/permalinks`와 `GET/PUT /api/v1/admin/permalinks`(템플릿), `GET /api/v1/resolve?path=`(게시된 콘텐츠와 리디렉션 플래그). 웹은 `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:page.xml`, `/feed.xml`(`?category=`, `?tag=`, `?author=`도 지원하며, 설정 → 읽기에 따라 전문 또는 요약을 제공하고 `dc:creator`, 카테고리, 첫 번째 오디오 파일을 enclosure로 포함합니다. 페이지를 제외하고 검색 가능으로 표시된 유형이 대상이며, 보호되지 않은 항목의 본문은 네 개씩 읽고 enclosure에는 라이브러리 파일의 크기를 담습니다. `?category=` 등은 유효한 슬러그 전체여야 합니다), `/llms.txt`, `/:slug.md`, `/oembed?url=&format=json`(oEmbed 제공자: 설정된 사이트 주소의, 게시되고 보호되지 않은 항목에 대해 iframe 없는 `rich` 카드를 제공하며, 단일 항목은 `rel="alternate" type="application/json+oembed"`로 이를 링크합니다)를 노출합니다. 피드 탐색 링크는 피드가 제공되는 동안(색인이 켜져 있고 사이트 URL이 설정된 경우)에만 나타납니다. SEO는 `/admin/seo`에서 설정하고, 고유주소 패턴과 카테고리/태그 기본 경로는 WordPress처럼 설정 → 고유주소(`/admin/settings/permalinks`)에 있습니다.
- 참고: [Google AI 기능](https://developers.google.com/search/docs/appearance/ai-features), [Article 구조화 데이터](https://developers.google.com/search/docs/appearance/structured-data/article), [robots 지시자](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [OpenGraph](https://ogp.me/), [사이트맵](https://www.sitemaps.org/protocol.html), [OpenAI 크롤러](https://developers.openai.com/api/docs/bots), [llms.txt 제안](https://llmstxt.org/), [WordPress 고유주소](https://wordpress.org/documentation/article/customize-permalinks/).
