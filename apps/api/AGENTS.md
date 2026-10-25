# apps/api 규약

상위 문서: [AGENTS.md](../../AGENTS.md)

코어 백엔드(`@cms/api`)의 규칙입니다. 전체 규칙(SOLID, 코어↔플러그인, 코드 스타일)은 루트 문서가 우선합니다.

## 디렉터리 구성

```
    prisma/                 schema.prisma, migrations/
    src/
      shared/               도메인 무관 유틸: errors, validation, isolate, logger
      domain/               유스케이스와 포트(인터페이스). content/, auth/, users/, site/, taxonomy/, permalinks/, seo/,
                            media/, comments/, search/, appearance/(메뉴·위젯), theme/, jobs/(스케줄러·잡), security/(속도 제한·캡차),
                            email/, webhooks/, tools/(사이트 상태·WXR 가져오기/내보내기), ports.ts
      plugin-runtime/       플러그인 수명주기·확장 지점: hook-bus, slot-registry, widget-registry, embed-registry,
                            admin-page-registry, route-registry(선언만 보관), plugin-host …
      infra/                어댑터: prisma/, plugins/(파일시스템·동적 import), meilisearch-engine, wxr-parser, smtp-mailer,
                            captcha-verifier, sharp-images, fs-media-storage, webhook-transport, secret-box, system.ts
      http/                 app.ts(createApiApp·createInstallerApp, 오류 매핑), services.ts(DI 타입), session.ts(인증 가드), plugin-gateway.ts, request/respond, routes/{api,install}/** (파일 경로 = URL)
      container.ts          컴포지션 루트 — 구현체를 아는 유일한 파일
      main.ts               부트스트랩
    test/                   bun test, test/support 의 인메모리 어댑터
```

## 계층 구조

- `domain/`·`plugin-runtime/`·`shared/`는 포트(`domain/ports.ts`)에만 의존하고, 구체 구현은 `infra/`에만 둡니다. 연결은 `container.ts`에서만 합니다. 전체 저장소 구조는 [루트 문서](../../AGENTS.md#3-저장소-구조)를 봅니다.
- 오류 메시지는 `#api/shared/errors`의 `Errors` 카탈로그에서 가져옵니다. 규칙 전문은 [루트 코드 스타일](../../AGENTS.md#43-코드-스타일)에 있습니다.
- 확장 지점과 플러그인 문서: [docs/plugins/](../../docs/plugins/extension-points.md). 라우트 표: [docs/api/routes.md](../../docs/api/routes.md). SSO: [docs/auth/sso.md](../../docs/auth/sso.md). 기능별 규약: [docs/features/](../../docs/features/).

## API 라우팅 규약 (ElysiaJS, 파일 기반)

라우팅·매칭은 **Elysia**가 하고, 라우트 등록은 공식 플러그인 목록에 있는 `elysia-autoload`(파일 시스템 라우팅)가 합니다. 자체 라우터(URLPattern 등)를 만들지 마세요.

- **파일 경로 = URL**: `http/routes/api/**`는 `/api` 아래, `http/routes/install/**`는 `/api/v1/install` 아래에 마운트됩니다. `index.ts` → 디렉터리 경로, `[id].ts` → `:id`, `[...].ts` → `*`(나머지 경로는 `params['*']`). 새 엔드포인트는 파일 하나를 추가하면 되고, 목록·조립 코드는 수정하지 않습니다.
- **라우트 파일 형식**: default export 대신 이름 있는 export `routes`를 씁니다. 파일 안의 경로 문자열은 `''`(파일이 정한 경로 그대로)입니다.

  ```ts
  export const routes = (app: ApiApp) =>
    session(app).get('', ({ user }) => json(user));
  ```

- **DI**: 서비스는 `ApiServices`(`http/services.ts`)로 정의하고 `createApiApp({ services, logger })`가 Elysia decorator로 등록합니다. 핸들러는 컨텍스트에서 `({ site, auth })`처럼 꺼내 씁니다. 설치 단계는 `createInstallerApp({ services: { installation }, logger })`가 같은 방식으로 `InstallerServices`를 씁니다. 구현체는 `container.ts`만 압니다. 두 팩토리는 비동기입니다(파일 스캔).
- **`routes/` 아래에는 라우트 파일만** 둡니다(로더가 모든 파일을 가져옵니다). 공용 코드는 `http/` 바로 아래(`request.ts`, `respond.ts`, `session.ts`, `params.ts` …)에 둡니다.
- **인증**: 라우트 파일에서 `session(app)`을 호출하면 그 뒤에 선언한 라우트에 로그인이 필요하고(401) 핸들러가 `user`를 받습니다. 가드는 그 파일 안에서만 적용됩니다. 가드를 쓰지 않은 파일은 공개입니다.
- **경로 파라미터 타입**: `params.ts`의 `idParams`/`slugParams`/`pluginParams`를 라우트 옵션으로 넘깁니다(와일드카드 `*`는 허용).
- **오류**: `apiErrors`(전역 `onError`)가 본문 형식을 정합니다. 미매칭 라우트 → 404 `not_found`, 파싱/검증 → 400 `invalid_input`, 도메인 오류는 `respond.ts`의 매핑을 따릅니다.
- **입력 검증**은 서비스의 zod 스키마가 합니다. 본문은 핸들러에서 `readJson(request)`/`request.text()`로 직접 읽고, 플러그인 게이트웨이는 `parse: 'none'`입니다.
- **플러그인 라우트**: `PluginRouteRegistry`는 선언(`list(owner)`)만 보관하고, `PluginGateway`가 플러그인별 Elysia 인스턴스로 컴파일해 처리합니다(Elysia는 라우트를 제거할 수 없어 등록 목록이 바뀔 때마다 다시 컴파일). 같은 메서드·경로 중복은 먼저 등록한 것이 우선합니다. 플러그인 `path`는 Elysia 문법(`/items/:id`, `/files/*`)이며 `/`로 시작해야 합니다. 게이트웨이 라우트 파일은 `routes/api/plugins/[pluginId]/`에 있습니다.
- **서버 시작/종료**: `createBootstrap`이 돌려주는 `app`(Elysia)을 `main.ts`가 `app.listen({ port, hostname, maxRequestBodySize })`로 시작하고 `app.stop()`으로 끝냅니다.
- **Elysia 업스트림 가정**: 요청 URL에서 경로 시작(`/`)을 11번째 문자 이후에서 찾습니다(`indexOf("/", 11)`). `http://` + 호스트가 3자 이하이고 포트가 없는 URL(`http://api/…`)은 모든 경로가 404가 되므로 그런 호스트명으로 API를 노출하지 마세요. 테스트는 `http://localhost/...`를 씁니다.

## 데이터베이스

- 스키마: `apps/api/prisma/schema.prisma`. 클라이언트는 `src/infra/prisma/generated`로 생성됩니다(커밋하지 않음).
- 스키마 변경: `bun run --filter @cms/api db:migrate:dev -- --name <설명>` → 생성된 SQL 검토 → 커밋. 배포 시 `db:migrate`.
- 읽기·확인·쓰기가 원자적이어야 하는 코어 설정 그룹은 `SettingsTransactions`(`domain/site/settings-transactions.ts`)를 씁니다. `PrismaSettingsTransactions`는 이름이 붙은 설정 행 잠금을 먼저 획득한 뒤 범위가 한정된 `SettingsTransaction`을 콜백에 넘깁니다. 호출자는 보호 대상 읽기, 메타데이터 개수 확인, 쓰기에 모두 그 저장소를 써야 합니다. 같은 그룹을 쓰는 모든 작성자는 잠금 이름을 공유해야 합니다. 기존의 일반 설정 읽기/쓰기는 계약이 그대로 유지됩니다.
- Prisma 사용은 `apps/api/src/infra/` 안에서만 합니다. 도메인으로 Prisma 타입을 노출하지 마세요(레코드 타입은 포트에 정의).
- `20261108000000_privacy_content_metadata`는 `privacy_requests`, `contents.menu_order`, 미디어 제목/설명, null을 허용하는 잡 만료 시각을 추가합니다. 기존 행은 보존되며, 기본값 덕분에 수정하기 전까지는 이전 정렬 순서와 빈 미디어 메타데이터가 유지됩니다. 운영 마이그레이션 실행은 이 추가형 SQL의 준비·테스트와 별개입니다.
- 테이블: `privacy_requests`, `users`, `user_identities`(SSO 연결), `sso_transactions`(진행 중인 SSO 요청), `sessions`, `password_tokens`, `api_tokens`, `contents`, `content_revisions`, `content_paths`(현재 주소·리디렉션 이력), `taxonomy_terms`(카테고리·태그), `content_terms`(콘텐츠 분류 연결), `media`, `content_media`, `comments`, `push_subscriptions`(댓글·사용자 브라우저 푸시 등록), `notice_windows`(알림 폭주 카운터), `notice_dispatches`(이미 큐에 넣은 알림 팬아웃), `search_outbox`, `scheduled_tasks`(반복 작업 임대), `jobs`(재시도되는 일회성 작업: 메일·웹훅), `rate_limit_buckets`, `settings`(사이트·테마·SEO·고유주소·읽기·메뉴·위젯·토론·보안·메일·검색·웹훅·콘텐츠 유형/필드 설정과 동시성 잠금), `plugins`, `plugin_data`.
- `20261024000000_taxonomies_search`는 기존 콘텐츠를 유지하며 `contents.search_text`를 HTML 본문에서 채운 뒤 필수 컬럼으로 바꿉니다. 이후 저장부터는 검증된 에디터 문서의 일반 텍스트로 갱신합니다. 분류 연결은 외래 키로 보호하고, 분류 계층 변경은 공통 설정 행 잠금으로 직렬화합니다.
- `20261025000000_core_seo`는 기존 콘텐츠/분류에 기본 SEO 값을 추가하고 `article` 유형을 허용합니다. `20261026000000_permalinks`는 기존 `/<slug>` 주소를 바이트 단위로 보존해 현재 주소로 등록합니다. 새 주소와 이력은 SHA-256 키와 실제 경로 바이트를 함께 비교하며, 주소 변경·콘텐츠 저장은 공통 행 잠금과 트랜잭션 안에서 처리합니다. 최초 발행 시각은 이후 비공개로 바꿔도 유지합니다. 이전 버전이 이미 지운 발행 시각/주소 이력은 복원할 수 없습니다. `content_paths`의 외래 키는 `ON UPDATE RESTRICT`입니다. MariaDB는 연쇄 갱신(`CASCADE`) 외래 키 컬럼을 CHECK 제약(`current_for = content_id`)에 쓰지 못하게 하며, 콘텐츠 id는 바뀌지 않습니다.
- `20261027000000_list_indexes`는 목록 정렬 인덱스(`contents(status, published_at)`, `contents(updated_at)`)와 만료 세션 정리용 `sessions(expires_at)`를 추가합니다. 데이터는 바꾸지 않습니다. 만료 세션은 제시될 때와 시간별 유지보수에서 삭제됩니다. 콘텐츠 사이트맵은 `content_paths.current_for` 인덱스 순서로 페이지를 나눕니다.
- `20261108100000_content_text_saved_at`는 비공개 텍스트 저장 워터마크를 추가하며, 가장 최근에 저장된 리비전 시각으로 채우고 없으면 기존 콘텐츠 시각으로 채웁니다. 콘텐츠 쓰기는 쓰기 잠금 아래에서 저장된 제목/요약/문서를 비교합니다. 실제 텍스트가 바뀌면 워터마크를 더 최근의 저장 시각으로 갱신하고, 콘텐츠·주소·아웃박스와 함께 이력이 원자적으로 생성·정리됩니다. 메타데이터만 바꾸는 쓰기, 예약 발행, 리비전 삭제는 워터마크와 이력을 보존합니다. 전체 저장은 텍스트 변경이 없어도 해당 작성자가 이미 반영한 자동 저장분을 명시적으로 지울 수 있으며, 그 이후의 자동 저장은 그대로 남습니다. 이 추가형 마이그레이션은 운영 실행과 별도로 준비·테스트하고, 이 필수 필드를 기록하지 않는 이전 버전의 쓰기 구현으로 롤백하지 마세요.
- `20261115000000_comment_notifications`는 `comments.notified_at`(승인된 댓글은 `updated_at`으로 채워 기존 댓글이 다시 알림되지 않게 함)과 `comments.reply_mail`을 추가하고, `push_subscriptions`(방문자/사용자 브라우저 등록, 댓글/사용자와 함께 연쇄 삭제, SHA-256 엔드포인트 식별)와 `notice_windows`(SHA-256을 키로 하는 수신자별 알림 폭주 카운터)도 추가합니다. 추가형입니다. [댓글](../../docs/features/comments.md#알림-이메일-및-브라우저-푸시)을 참고하세요.
- `20261116000000_notice_dispatches`는 `notice_dispatches`(이미 큐에 넣은 댓글 알림 팬아웃)를 추가합니다. 추가형입니다. 적용된 마이그레이션은 수정하지 않습니다. 마이그레이션이 어느 DB에든 반영된 뒤의 변경은 새 마이그레이션에 넣습니다.
- `20261117000000_comment_author_meta`는 null을 허용하는 `comments.author_ip`(`VARCHAR(45)`)와 `comments.author_user_agent`(`VARCHAR(255)`)를 추가하며, 기존 댓글은 null로 남습니다. 추가형입니다. [댓글](../../docs/features/comments.md#작성자-ip-주소와-사용자-에이전트)을 참고하세요.
- `20261107100000_session_created_at`은 `sessions.created_at`을 추가합니다(기존 세션은 마이그레이션 시각). 데이터는 지우지 않습니다.
- `20261028000000_users_roles`부터 `20261103000000_search_outbox`까지는 역할·사용자 프로필, 작업·속도 제한·토큰, 콘텐츠 워크플로, 미디어, 필드, 댓글, 검색 아웃박스를 추가합니다. `20261104000000_content_fulltext`는 MariaDB 폴백 검색용 복합 FULLTEXT 인덱스를 추가합니다.
- 반복 작업은 `scheduled_tasks` 임대로 인스턴스 하나에서만 돌며 실행 중 임대를 갱신합니다. 잡은 `SELECT … FOR UPDATE SKIP LOCKED`로 네 개씩 가져와 병렬 처리하고, 완료·실패·임대 해제는 현재 소유자만 할 수 있습니다. 속도 제한은 행 잠금 트랜잭션에서 시도를 예약합니다.
- 콘텐츠 쓰기(저장·휴지통·예약 발행·삭제)는 같은 트랜잭션에서 `search_outbox`에 기록합니다. 분류 수정/삭제와 작성자 콘텐츠 일괄 삭제는 `content_id = NULL`(전체 재색인)을 기록합니다. 트리거는 쓰지 않습니다(바이너리 로그가 켜진 MariaDB에서 권한 문제가 생깁니다).
- 플러그인을 위한 테이블/컬럼 추가 금지. 플러그인 데이터는 `plugin_data`(settings/kv)만 씁니다.

## 테스트

- 도메인·플러그인 런타임은 `apps/api/test/support`의 인메모리 어댑터와 `createRuntime()`으로 DB 없이 테스트합니다. 새 포트를 만들면 인메모리 구현도 같은 계약으로 추가합니다.
- 플러그인 관련 변경은 **비활성화·삭제·실패 시 코어가 원래대로 동작함**을 검증하는 테스트를 반드시 포함합니다(`plugin-host.test.ts` 참고).
- 인메모리 어댑터는 `memory*.ts`(콘텐츠·공개 콘텐츠·분류·사용자·작업·보안·리비전·미디어·댓글·검색)에 있습니다. 검색은 `MemorySearchEngine`/`MemorySearchSource`로 폴백 보장을 검증하고, WXR은 내보내기→가져오기 왕복으로 검증합니다.
- Prisma 어댑터는 실제 MariaDB가 필요합니다. SSO 어댑터와 마이그레이션은 `CMS_TEST_DATABASE_URL`(DB 생성 권한이 있는 서버 계정)을 설정했을 때만 `apps/api/test/sso-prisma.test.ts`가 검증합니다. 이 테스트는 `cms_sso_test_<uuid>` DB를 새로 만들어 마이그레이션을 적용하고 끝나면 지웁니다. URL에 적힌 DB는 쓰지 않습니다. 설정하지 않으면 건너뜁니다.
