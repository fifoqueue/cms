# HTTP API 라우트

콘텐츠 관리자의 생성·수정, 휴지통·복원, 리비전 복원, 자동 저장은 댓글과 같은
프런트엔드 비밀 기반 브라우저 증명을 사용합니다. 제출한 JSON으로는 origin을 설정할 수 없습니다.
`AdminContent.origin`은 `content.editOthers` 권한이 있는 사용자에게는 null을 허용하는 `ip`와
`userAgent`를 가진 `created`·`modified` 객체를 담고, 그 외에는 null입니다. 관리자
리비전 DTO에는 null을 허용하는 `ip`와 `userAgent`가 있으며, 해당 권한이 없으면 둘 다 null입니다.

## 미디어 저장소

재동기화 응답에는 `cleanupNeedsAttention: number`(자동 디스패치 횟수를 모두 소진한 정리용 삭제 표시 수)도 들어갑니다.
연결 테스트는 작은 `<prefix>/.cms-probe` 객체 하나를 덮어쓴 뒤 연결 테스트가 끝나기 전에 동기적으로 삭제합니다. 정리용 삭제 표시를 만들지 않고, 후보 자격 증명도 보관하지 않습니다. 삭제에 실패하면 400 `invalid_input`을 고정 SDK 문구 `Errors.MediaStorageProbeCleanup`(`"The connection test file could not be removed."`)과 `issues: [{ path: "probe", message: Errors.MediaStorageProbeCleanup, params: { bucket, key } }]`와 함께 반환합니다. `key`에는 설정된 접두사가 포함되고, 플러그인 probe는 `bucket`에 드라이버 id를 씁니다. SDK 오류 파싱은 `probe` 이슈에서 이 두 개의 길이 제한 문자열만 허용하고 그 밖의 임의 필드는 제거합니다.

관리자 미디어 행에는 `missingAt: string | null`(원본이 없을 때의 ISO 타임스탬프)이 있습니다. `GET /api/v1/admin/media?missing=true`와 SDK `media.list({ missing: 'true' })`가 이 행을 필터링합니다.
probe·저장 실패는 SDK에 등록된 안전한 사유 분류(`MediaStorageProbeAuth`, `MediaStorageProbeBucket`, `MediaStorageProbeNetwork`, `MediaStorageProbeTls`, `MediaStorageProbeRejected`)와 함께 400 `invalid_input`으로 반환하며, 제공자 응답 본문이나 자격 증명은 포함하지 않습니다. 이그레스 정책 거부는 403 상태를 유지합니다. 필수 플러그인 필드가 없으면 `pluginSettings.<key>` 경로에 `MediaStorageFieldRequired` 이슈를 반환합니다.

- `GET /api/v1/admin/media/storage`: `settings.manage`, `MediaStorageSettings`를 반환합니다.
- `PUT /api/v1/admin/media/storage`: `settings.manage`, `MediaStorageInput`을 받아 저장 전에 테스트하고 설정을 반환합니다.
- `POST /api/v1/admin/media/storage/test`: `settings.manage`, 같은 입력, 서명된 probe PUT/삭제(목록 조회 없음) 뒤 204를 반환합니다.
- `POST /api/v1/admin/media/storage/resync`: `media.manage`, 본문 없음, `MediaResync`와 함께 202를 반환합니다. 반복 호출하면 진행 중인 작업을 반환합니다.
- `GET /api/v1/admin/media/storage/resync`: `media.manage`, 최신 `MediaResync` 또는 null을 반환합니다.

SDK: `createAdminClient(...).media.storage.{get(), update(input), test(input), resync(), resyncStatus()}`.
설정 DTO: `{ driver: 'local' | 's3' | 'plugin:<owner>:<key>', s3: null | { endpoint, region, bucket, accessKeyId, secretAccessKeyConfigured, publicBaseUrl?, forcePathStyle, prefix }, availableDrivers: [{ id, label, fields: [{ key, label, type, required }] }], pluginSettings?, pluginSecretsConfigured? }`.
플러그인 필드는 `text | number | boolean | secret`을 씁니다. 입력은 `pluginSettings`의 스칼라 값을 받으며, 생략한 비밀 값 필드는 봉인된 값을 유지하고 빈 문자열은 선택적 비밀 값을 지웁니다. 출력에는 비밀 값이 없고 `pluginSecretsConfigured`에 키만 나열합니다. 다른 드라이버를 선택해도 각 드라이버는 자신의 설정을 유지하며, 사용할 수 없는 플러그인 드라이버가 로컬 저장소로 대체되는 일은 없습니다.
입력은 `secretAccessKeyConfigured` 대신 선택적 `secretAccessKey`를 받습니다. 생략하면 유지하고, 비어 있지 않은 값을 주면 교체합니다. 액세스 키 ID를 바꾸면 그 비밀 값도 필요합니다.
재동기화 DTO: `{ id, status: 'queued' | 'running' | 'completed' | 'failed', driver, startedAt, finishedAt: string | null, scanned, refreshed, missing, untracked, error: string | null }`.

상위 문서: [AGENTS.md](../../AGENTS.md)

라우트 작성 규약은 [apps/api/AGENTS.md](../../apps/api/AGENTS.md)에 있습니다.

모든 오류 응답: `{ "error": { "code", "message", "issues?" } }`.

- `message`와 `issues[].message`는 SDK `Errors`의 고정 문구입니다. 값이 들어가는 문구도 문구 자체는 바뀌지 않고, 값은 `issues[].params`로 따로 옵니다. 클라이언트는 문구를 키로 번역하고 `params`로 값을 채웁니다.
- `issues[]`: `{ path: string, message: string, params?: Record<string, string | number> }`. `path`는 필드 경로(`seo.title`)이고, `""`는 거절 자체(최상위 `message`)의 값을 담는 항목입니다. 예: `{ "message": Errors.MediaTooLarge, "issues": [{ "path": "", "message": Errors.MediaTooLarge, "params": { "maxBytes": 10485760 } }] }`.
- `params` 한도(SDK `ISSUE_PARAMS_LIMITS`, `issueParamsSchema`): 키 최대 8개, 키 40자 이하, 문자열 값 500자 이하, 숫자는 유한한 값. 서버는 보내기 전에 같은 한도로 자르고(`issueParams`), 한도를 넘는 응답은 SDK 파싱에서 `issues`가 버려집니다. 어떤 키가 오는지는 SDK `Errors`의 각 항목 주석에 있습니다.
- `params`에는 비밀값, 자격 증명, 외부 서버(메일·검색·웹훅 수신자)의 응답 원문이 들어가지 않습니다. 실패 원인은 범주로만 옵니다. 예: 테스트 메일 `EmailSendFailed`의 `reason`(`auth`·`timeout`·`tls`·`network`·`rejected`, SDK `EMAIL_FAILURE_REASONS`)과 HTTP 제공자의 `status`. 원문은 서버 로그에만 남습니다.
- 같은 형태의 값은 오류 응답 밖의 상태 필드에도 씁니다: WXR 가져오기 `skipped[].params`, 플러그인 `errorParams`, 검색 상태 `lastErrorParams`, 사이트 상태 `detail[]`의 `{ message, params }` 항목.

- `GET/PUT /api/v1/admin/users/:id/fields`: 인증된 본인 또는 `users.manage`; private/no-store. GET은 `{ fields, values }`를 반환하고, PUT은 네임스페이스가 붙은 스칼라 값 패치를 받아 활성 선언을 검증한 뒤 같은 DTO를 반환합니다.
- `GET /api/v1/admin/captcha-providers`: `settings.manage`; 등록된 캡차 제공자 ID와 라벨이며 secret은 없습니다.
- `POST /api/v1/admin/privacy/requests/:id/erase`: 이제 빈 응답 대신 `{ results, failed }`를 반환합니다. 코어 삭제는 계속 트랜잭션으로 처리되며, `failed`는 후속 조치가 필요한 확장 삭제기를 나열합니다.

`POST /api/v1/auth/recovery-codes`는 `settings.manage`와 10분 안에 발급된 대화형 세션이 필요하며 API 토큰은 거부합니다. 401 메시지는 `Sign in again before generating recovery codes.`입니다. 알림 전송에 실패해도 성공한 생성·복구 응답은 달라지지 않습니다.

`POST /api/v1/auth/factors/:factor/enroll`과 `intent: link`인 SSO `/start`도 마찬가지로 최근의 대화형 세션이 필요하며 API 토큰은 쓸 수 없습니다. 최근성 검사에 걸리면 401과 `Sign in again before adding credentials to your account.`를 반환합니다.

탐색 및 모양 확장 엔드포인트:

- `GET /api/v1/admin/menus/types`: `appearance.manage`; `{ key, label, source, searchable }[]`.
- `GET /api/v1/admin/menus/objects?type=&search=&page=&pageSize=`:
  `appearance.manage`; `{ items: [{ id, label }], total }`; 페이지 크기 1–100,
  검색어는 최대 200자. 실패했거나 비활성화된 제공자는 빈 페이지를 반환합니다.
- 테마 편집기의 템플릿·파트 항목에는 `source`(`theme`, `admin`, 플러그인 id)와
  `readOnly`가 있습니다. 플러그인 기본값은 읽기 전용이며, 저장하면 플러그인 데이터를
  고치지 않고 관리자 커스터마이징을 새로 만듭니다.

- `GET /api/v1/seo/providers`: 공개, 등록된 사이트맵 제공자 키.
- `GET /api/v1/seo/sitemap?kind=&page=&pageSize=`: 공개 제공자 페이지.
  제공자를 실행하기 전에 코어 크롤러 정책을 확인하고, 이어서
  `sitemap.entries`를 실행합니다.
- `POST /api/v1/seo/filter`: 프런트엔드 전용 `{ kind, value }` 표시용 RPC이며,
  이런 입력 1–7개의 배열도 받아 입력 순서대로 결과를 반환합니다.
  `SSO_FRONTEND_SECRET_HEADER`와 유효한
  `SSO_CLIENT_ADDRESS_HEADER`가 필요합니다. 증명은 상수 시간으로 검사하고, 스트리밍 본문은 512 KiB로 제한하며,
  증명된 네트워크당 분당 6,000건, 프로세스 전체 60,000건으로 제한합니다.
  종류: `sitemap.entries`, `feed.items`, `feed.channel`, `robots.txt`, `llms.txt`,
  `seo.markdown`, `seo.meta`. 증명이 유효하지 않으면 403, 한도를 소진하면 429,
  입력이 너무 크면 413을 반환합니다.
- `GET /api/v1/admin/patterns/contributions`: 인증된 `content.create`;
  활성 플러그인 패턴 그룹의 `{ key, source, patterns }[]`를 반환합니다(`source`는 플러그인 id). 패턴을 삽입하면
  편집기 문서가 복사되며, 저장된 동기화 패턴을 참조하지는 않습니다.

| 메서드              | 경로                                                                                | 인증            | 설명                                                              |
| ------------------- | ----------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| GET                 | `/api/health`                                                                       |                 | 상태 확인                                                         |
| GET                 | `/api/v1/site`                                                                      |                 | 사이트 설정 (아이콘·로고는 공개 이미지로)                         |
| GET                 | `/api/v1/layout`                                                                    |                 | 사이트·SEO·테마·읽기·메뉴·위젯 묶음                               |
| GET                 | `/api/v1/content?type&page&pageSize&search&category&tag`                            |                 | 발행 콘텐츠 요약 목록 (`content.publicSummary` 필터 적용)         |
| GET                 | `/api/v1/content/:slug`                                                             |                 | 발행 콘텐츠 1건                                                   |
| GET                 | `/api/v1/slots?path&contentId`                                                      |                 | 슬롯 HTML                                                         |
| GET                 | `/api/v1/auth/status`                                                               |                 | `{ setupRequired }`                                               |
| GET                 | `/api/v1/install/status`                                                            |                 | `{ databaseConfigured, setupRequired }`                           |
| POST                | `/api/v1/install/database`                                                          | 설치 키         | DB 검증·마이그레이션·접속 설정 저장                               |
| POST                | `/api/v1/install/complete`                                                          | 설치 키         | 사이트·첫 관리자·세션을 원자적으로 생성                           |
| GET / POST          | `/api/v1/auth/sign-in` / `/sign-in/:method`                                         |                 | 허용된 방식 / 단계별 로그인 시작                                  |
| POST                | `/api/v1/auth/sign-in/setup/:method`                                                |                 | 이메일로 받은 1회용 토큰으로 로그인 설정                          |
| POST                | `/api/v1/auth/sign-in/continue` · `/sign-in/factor`                                 | 선택            | 계속 진행 / 인증 요소 선택. 계정 등록은 해당 소유자의 세션이 필요 |
| GET / POST / DELETE | `/api/v1/auth/factors` / `/factors/:factor/enroll` / `/factors/:factor/:credential` | ✔               | 본인의 2단계 인증 요소 조회·등록·삭제                             |
| GET / PUT           | `/api/v1/admin/sign-in`                                                             | settings.manage | 로그인 정책과 등록된 방식·인증 요소                               |
| POST                | `/api/v1/auth/login` · `/logout`                                                    |                 | 세션 발급/폐기                                                    |
| GET                 | `/api/v1/auth/me`                                                                   | ✔               | 현재 사용자                                                       |
| GET                 | `/api/v1/auth/sso`                                                                  |                 | 활성화된 제공자만 포함. 로그인 정책은 별도                        |
| POST                | `/api/v1/auth/sso/start`                                                            | ✔               | 계정 연결 시작. 로그인·claim은 로그인 엔진 사용                   |
| POST                | `/api/v1/auth/sso/callback`                                                         | ✔               | 시작한 사용자의 계정 연결 완료                                    |
| GET                 | `/api/v1/auth/sso/identity`                                                         | ✔               | 현재 사용자의 SSO 연결·운영자 할당 상태                           |
| DELETE              | `/api/v1/auth/sso/identity/:id`                                                     | ✔               | 이 사용자의 연결 해제. SSO만 남은 마지막 접근 수단 보호           |
| POST                | `/api/v1/auth/recovery`                                                             |                 | 1회용 관리자 복구 코드. 로그인 보호 적용                          |
| GET, POST, DELETE   | `/api/v1/auth/recovery-codes`                                                       | settings.manage | 상태 조회, 코드 10개 교체(한 번만 표시), 삭제                     |
| CRUD                | `/api/v1/admin/content[/:id]`                                                       | ✔               | 모든 상태의 콘텐츠                                                |
| GET                 | `/api/v1/admin/site`                                                                | ✔               | 사이트 설정 (아이콘·로고 id와 이미지)                             |
| PUT                 | `/api/v1/admin/site`                                                                | ✔               | 사이트 설정 저장 (`iconId`/`logoId`는 미디어 이미지)              |
| GET                 | `/api/v1/admin/plugins`                                                             | ✔               | 플러그인 목록                                                     |
| POST                | `/api/v1/admin/plugins`                                                             | ✔               | 번들 업로드(본문 = JS 소스) 설치/업그레이드                       |
| POST                | `/api/v1/admin/plugins/:id/enable·disable`                                          | ✔               | 활성화/비활성화                                                   |
| PUT                 | `/api/v1/admin/plugins/:id/settings`                                                | ✔               | 설정 저장 (manifest 기준 검증)                                    |
| DELETE              | `/api/v1/admin/plugins/:id`                                                         | ✔               | 삭제 (번들·설정·KV 포함)                                          |
| \*                  | `/api/plugins/:id/*`                                                                | 라우트별        | 플러그인 라우트 게이트웨이                                        |

| 메서드      | 경로                                     | 인증 | 설명                                         |
| ----------- | ---------------------------------------- | ---- | -------------------------------------------- |
| GET         | `/api/v1/taxonomies/:taxonomy`           | 공개 | 공개 용어와 발행 수 (`category` 또는 `tag`)  |
| GET         | `/api/v1/taxonomies/:taxonomy/:slug`     | 공개 | 공개 아카이브 용어                           |
| GET, POST   | `/api/v1/admin/taxonomies/:taxonomy`     | 세션 | 용어 목록 조회/생성                          |
| PUT, DELETE | `/api/v1/admin/taxonomies/:taxonomy/:id` | 세션 | 용어 수정/삭제                               |
| GET         | `/api/v1/theme`                          | 공개 | 활성 테마 표시 매니페스트                    |
| GET, POST   | `/api/v1/admin/themes`                   | 세션 | 테마 목록 조회/설치 (`application/zip` 본문) |
| POST        | `/api/v1/admin/themes/:id/activate`      | 세션 | 테마 활성화                                  |
| DELETE      | `/api/v1/admin/themes/:id`               | 세션 | 비활성 사용자 지정 테마 제거                 |

| 메서드                 | 경로                                                                                           | 인증                                    | 설명                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                    | `/api/v1/theme?preview=`                                                                       | 공개                                    | 활성 테마 또는 유효한 미리보기 토큰이 가리키는 테마                                                                                                                                                             |
| POST                   | `/api/v1/admin/themes/:id/preview`                                                             | appearance.manage                       | 서명된 30분짜리 미리보기 토큰                                                                                                                                                                                   |
| GET                    | `/api/v1/reading · /menus/:location · /widgets`                                                | 공개                                    | 읽기 설정(프런트/글 페이지 경로 포함), 해석된 메뉴, 두 위젯 영역 모두                                                                                                                                           |
| GET, PUT               | `/api/v1/admin/reading · /menus · /widgets`                                                    | settings / appearance                   | 읽기 설정, 메뉴와 위치, 위젯 영역 (`GET …/widgets/types`는 플러그인 위젯을 나열)                                                                                                                                |
| GET, PUT               | `/api/v1/admin/writing`                                                                        | content.create / settings.manage        | 새 항목의 쓰기 기본값 (기본 카테고리, 기본 초안 상태)                                                                                                                                                           |
| GET, POST, PUT, DELETE | `/api/v1/admin/patterns[/:id]`                                                                 | content.create (+ publish / editOthers) | 페이지로 나뉜 패턴 요약 (`page`, `pageSize`, `search`); 권한이 있는 단일 문서                                                                                                                                   |
| GET, POST              | `/api/v1/comments?contentId=&page=`                                                            | 공개 (POST는 속도 제한·캡차)            | 승인된 스레드 (`notifications: { email, push }`); 작성 (`{ status, comment, page, pendingProof, commenterProof, pushToken }`); 주소와 `CLIENT_USER_AGENT_HEADER`는 프런트엔드 비밀이 있을 때만 저장             |
| POST                   | `/api/v1/comments/push`                                                                        | 공개 (속도 제한)                        | `{ token, subscription }` → `{ ok: true }`: `pushToken`이 가리키는 댓글의 푸시 답글을 받을 방문자 브라우저                                                                                                      |
| POST                   | `/api/v1/comments/unsubscribe`                                                                 | 공개 (속도 제한)                        | `{ token }` → `{ channel: 'email' \| 'push' }`; 유효하지 않거나 만료 → 400 `CommentUnsubscribeInvalid`                                                                                                          |
| POST                   | `/api/v1/push/renew`                                                                           | 공개 (속도 제한)                        | `{ old: { endpoint, auth }, subscription }` → `{ ok: true }`: 저장된 인증 비밀 값(`auth`)이 `old.auth`와 같은 `old.endpoint`의 활성 등록을 옮김. 일치하지 않아도 같은 응답 (`pushsubscriptionchange`, 재동기화) |
| GET, PUT, DELETE       | `/api/v1/admin/push-subscription`                                                              | content.create (쓰기는 속도 제한)       | `{ publicKey }` (푸시가 꺼져 있으면 null); 현재 사용자의 브라우저 등록 `{ subscription }` / 제거 `{ endpoint }`                                                                                                 |
| GET                    | `/api/v1/admin/comments · /comments/counts`                                                    | comments.moderate                       | 검토 목록 (`status`, `contentId`, `ids` = 쉼표로 구분한 최대 100개 id, 이름·이메일·IP·본문 대상 `search`; 항목에 `authorIp`, `authorUserAgent` 포함)과 상태별 개수                                              |
| PUT, DELETE, POST      | `/api/v1/admin/comments/:id · /:id/reply · /bulk`                                              | comments.moderate                       | 수정/삭제 (IP와 사용자 에이전트는 수정할 수 없음), 모더레이터로서 답글 작성 (증명된 IP/사용자 에이전트 저장), 일괄 승인/승인 취소/스팸/휴지통/삭제                                                              |
| GET, PUT               | `/api/v1/admin/discussion`                                                                     | settings.manage                         | 토론 설정                                                                                                                                                                                                       |
| GET                    | `/api/v1/content-types · /authors/:slug`                                                       | 공개                                    | 공개 콘텐츠 타입과 필드; 공개 작성자 아카이브                                                                                                                                                                   |
| *                      | `/api/v1/admin/content-types[/:key] · /fields[/:key]`                                          | content.create / fields.manage          | 콘텐츠 모델                                                                                                                                                                                                     |
| POST, GET, PUT, DELETE | `/api/v1/admin/content/:id/{trash,restore,preview,autosave,revisions[/:revisionId[/restore]]}` | 세션                                    | 콘텐츠 워크플로                                                                                                                                                                                                 |
| GET                    | `/api/v1/preview/:token · POST /api/v1/unlock/:id`                                             | 공개                                    | 서명된 미리보기; 비밀번호 잠금 해제 증명                                                                                                                                                                        |
| *                      | `/api/v1/admin/media[/:id] · GET /api/v1/media/files/*`                                        | media.upload / 공개                     | 미디어 라이브러리; Range를 지원하는 파일                                                                                                                                                                        |
| GET                    | `/api/v1/admin/media?month=YYYY-MM&unattached=true · /admin/media/:id/context`                 | media.upload                            | 라이브러리 필터; 더 새로운/오래된 이웃 항목과 파일을 표시하는 항목                                                                                                                                              |
| POST                   | `/api/v1/admin/media/:id/derivative?name=`                                                     | media.upload; 소유자 또는 media.manage  | 활성 등록된 크기만 허용; private, no-store WebP이며 저장하지 않음. 서비스당 동시 변환 2개, 초과 시 429 반환                                                                                                     |
| *                      | `/api/v1/admin/users[/:id] · /users/authors`                                                   | users.manage / content.create           | 사용자와 작성자 선택지                                                                                                                                                                                          |
| *                      | `/api/v1/auth/password{,/forgot,/reset} · /auth/tokens[/:id] · PUT /auth/me`                   | 세션 또는 공개                          | 비밀번호 변경/재설정, API 토큰, 본인 프로필                                                                                                                                                                     |
| GET, PUT               | `/api/v1/admin/security · /email (POST /email/test) · GET /security/captcha`                   | settings.manage / 공개                  | 속도 제한과 캡차, 이메일, 공개 캡차 설정                                                                                                                                                                        |
| GET                    | `/api/v1/admin/capabilities`                                                                   | users.manage                            | 역할 할당용으로 등록된 권한(코어 및 플러그인)                                                                                                                                                                   |
| GET, PUT, POST         | `/api/v1/admin/search · /search/status · /search/test · /search/reindex`                       | settings.manage                         | Meilisearch 연결, 상태, 연결 테스트, 재구축                                                                                                                                                                     |
| GET, POST              | `/api/v1/admin/plugin-pages · /:pluginId/:key · /:pluginId/:key/:action`                       | 페이지 권한                             | 플러그인 관리자 페이지(블록)와 폼 동작                                                                                                                                                                          |
| GET                    | `/api/v1/admin/plugin-blocks`                                                                  | content.create                          | 편집기용으로, 활성 플러그인의 블록과 속성 필드                                                                                                                                                                  |
| GET                    | `/api/v1/admin/plugins/:id/update`                                                             | plugins.manage                          | 플러그인 `updateUrl`의 최신 버전                                                                                                                                                                                |
| *                      | `/api/v1/admin/webhooks[/:id] · /:id/ping · /:id/rotate`                                       | tools.manage                            | 웹훅, 테스트 전송, 새 비밀 값                                                                                                                                                                                   |
| GET, POST              | `/api/v1/admin/export · /admin/import`                                                         | tools.manage                            | WXR 내보내기(XML 다운로드)와 가져오기(XML 본문)                                                                                                                                                                 |
| GET                    | `/api/v1/admin/health`                                                                         | tools.manage                            | 사이트 상태 점검과 시스템 정보                                                                                                                                                                                  |
| GET                    | `/api/v1/admin/themes/:id/editor`                                                              | appearance.manage                       | 사이트 편집기: 템플릿, 파트, 변경 내용이 반영된 스타일                                                                                                                                                          |
| PUT, DELETE            | `/api/v1/admin/themes/:id/templates/:name · /parts/:slug · /styles`                            | appearance.manage                       | 템플릿, 파트 또는 전역 스타일 저장·초기화                                                                                                                                                                       |
| GET, PUT               | `/api/v1/admin/fonts`                                                                          | appearance.manage                       | 모든 테마 스타일에서 쓸 수 있는 사이트 글꼴 (`{ fonts }`)                                                                                                                                                       |
| GET, PUT               | `/api/v1/admin/sso`                                                                            | settings.manage                         | 싱글 사인온 설정 (클라이언트 비밀은 반환하지 않음; 리디렉션 URI 표시)                                                                                                                                           |
| GET                    | `/api/v1/admin/frontend-secret`                                                                | settings.manage                         | 웹 서버의 방문자 증명 비밀 (서버 간 전용, 브라우저로는 보내지 않음)                                                                                                                                             |

| 메서드    | 경로                                        | 인증                        | 설명                                                  |
| --------- | ------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| GET       | `/api/v1/privacy`                           | 공개                        | 게시된 정책 링크와 쿠키 동의 설정                     |
| POST      | `/api/v1/privacy/confirm`                   | 서명된 토큰; 속도 제한/캡차 | 1회용 개인정보 확인                                   |
| GET, PUT  | `/api/v1/admin/privacy/settings`            | settings.manage             | 개인정보 정책과 쿠키 설정                             |
| GET, POST | `/api/v1/admin/privacy/requests`            | users.manage                | 페이지로 나뉜 요청 대기열 / 확인 이메일               |
| POST      | `/api/v1/admin/privacy/requests/:id/export` | users.manage                | 확인된 대상의 스트리밍 JSON 다운로드                  |
| POST      | `/api/v1/admin/privacy/requests/:id/erase`  | users.manage                | 확인된 대상의 트랜잭션 방식 익명화·개인정보 삭제 처리 |
| GET       | `/api/v1/admin/content/counts?type=`        | content.create              | 상태·휴지통·전체별 그룹 개수                          |
| GET       | `/api/v1/comments/feed?contentId=&limit=`   | 공개                        | 승인된 비보호 댓글 피드 DTO                           |
| GET       | `/api/v1/seo/sitemap?kind=author\|taxonomy` | 공개                        | 작성자·사용자 지정 분류 탐색                          |
