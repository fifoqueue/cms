# 플러그인 확장 지점

상위 문서: [AGENTS.md](../../AGENTS.md)

모든 확장 지점은 범용이며, 도메인별로 나눠 정리했습니다. 새 행은 해당 도메인 아래에 추가하고, 도메인이 없으면 소제목을 새로 만듭니다. 확장 원칙은 [아래](#확장-원칙-wordpress-수준)에 있습니다. 작성 방법은 [authoring.md](authoring.md), 수명주기·격리는 [lifecycle-and-isolation.md](lifecycle-and-isolation.md)를 봅니다.

## 코어

메뉴 리졸버 함수는 `label`과 선택 항목인 `objects({ search, page, pageSize })`를 노출할 수 있으며,
`{ items: [{ id, label }], total }`을 반환합니다. 선택기는 제공자 격리와 검증을 거쳐 실행되며
페이지 크기는 최대 100입니다. SDK `menus.types()`는 플러그인 유형을 찾고,
`menus.objects(type, query)`는 해당 유형을 조회합니다. `MenuItem.taxonomy`는 등록된
분류 키를 받습니다. 비활성화된 분류는 설정을 삭제하지 않고 공개 메뉴에서만 빠집니다.
테마 기여는 사이트 편집기 항목에 `source`와 `readOnly`와 함께 표시됩니다.
템플릿/파트 커스터마이징을 저장하면 이를 덮어쓰고, 초기화하면 제공자 기본값으로 돌아갑니다.

관리자 SDK `patterns.contributions()`는 `{ key, source, patterns }[]`를 반환합니다.
`source`는 선택된 유효한 기여를 제공한 플러그인을 나타냅니다.
`roles.capabilities()`는 `{ key, label, source }[]`를 반환합니다. 역할 정의에도
`source`가 있으며, 값은 `core`, 플러그인 id, 저장된 커스터마이징을 뜻하는 `admin` 중 하나입니다.

프런트엔드 서버는 `createContentClient(...).seo.filter(kind, value, proof)`
또는 `seo.filterBatch(inputs, proof)`(입력 1–7개, 순서가 유지된 결과)를 사용합니다. 둘 다
프런트엔드 비밀 값과 방문자 주소를 보내며, 증명 값은 브라우저에 노출하면 안 됩니다.
`seo.providers()`는 사이트맵 제공자 키를 나열하고, `seo.sitemap({ kind, page, pageSize })`는
등록된 모든 제공자 키를 받습니다.

| 능력      | API                                                                                  | 설명                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 액션 훅   | `hooks.on(name, handler)`                                                            | `content.created/updated/published/trashed/restored/deleted`, `media.uploaded/deleted`, `comment.created/statusChanged`, `site.updated`. 결과에 영향 없음                                                                                                                                                                                                                                                    |
| 필터 훅   | `hooks.filter(name, handler, prio?)`                                                 | `content.beforeSave`(저장 직전, 비밀번호 제외·변경 불가), `content.public`(공개 API 단건 응답 직전, 본문 포함), `content.publicSummary`(공개 목록 항목 응답 직전, 본문 없음), `comment.beforeSave`(방문자 댓글 저장 직전; `body`·`status`만 반영). 낮은 prio 먼저                                                                                                                                            |
| 슬롯      | `slots.provide(slot, renderer)`                                                      | `head`, `site.header`, `site.footer`, `content.before`, `content.after`, `comments.before`, `comments.after` 에 HTML 주입                                                                                                                                                                                                                                                                                    |
| 위젯      | `widgets.provide(key, { name, render })`                                             | 위젯 유형 `plugin:<id>:<key>`. 관리자가 사이드바/푸터 영역에 배치하고 `render(settings)`의 HTML이 표시됩니다(실패 시 해당 위젯만 빠짐)                                                                                                                                                                                                                                                                       |
| 임베드    | `embeds.register({ name, render })`                                                  | 에디터 임베드 블록의 주소를 플레이어 HTML로 바꿉니다. 설정 → 임베드에서 관리하는 활성 코어 제공자를 목록 순서대로 먼저 확인하고 플러그인 제공자를 확인합니다. 기본값은 YouTube·Vimeo·X·Instagram이며 관리자가 추가·비활성화·정렬할 수 있습니다. 일치하지 않는 주소는 링크로 남습니다.                                                                                                                        |
| 블록      | `blocks.register(key, { title, description?, attributes?, render(attrs, context) })` | 편집기에 넣는 동적 블록(`plugin:<id>:<key>`, WordPress `register_block_type`). 속성은 설정 필드(text/number/boolean)와 `select`로 선언하고, 콘텐츠에는 범용 `pluginBlock` 노드로 저장됩니다. 플러그인이 켜져 있으면 저장 시 선언으로 검증하고, 제공할 때 격리 실행해 HTML을 넣습니다(요청 안에서만 캐시, 실패·시간 초과·비활성은 빈 출력). 꺼진 플러그인의 블록은 그대로 보존되며 편집기에 안내가 표시됩니다 |
| 작업      | `tasks.every(name, intervalMs, task)`                                                | 최소 1분 간격의 반복 작업. 코어 스케줄러가 인스턴스 하나에서만 실행합니다(`plugin:<id>:<name>`, 60초 제한)                                                                                                                                                                                                                                                                                                   |
| 관리 화면 | `admin.page(key, { title, capability?, render, actions? })`                          | 관리자 메뉴의 플러그인 페이지. `render()`는 **블록 데이터**(`heading/text/notice/stats/table/form`, `adminBlockSchema`)만 반환하며 HTML·스크립트는 받지 않습니다. 폼 값은 폼 필드 기준으로 검증된 뒤 `actions[name]`에 전달됩니다                                                                                                                                                                            |
| 대시보드  | `admin.dashboardWidget(key, { title, capability?, render })`                         | 대시보드 상자. `render()`는 표시 블록(`form` 제외)만 반환하고 다른 플러그인 호출처럼 격리·시간 제한됩니다. 실패·비활성 플러그인의 상자는 빠지며 기본 권한은 `plugins.manage`입니다                                                                                                                                                                                                                           |
| 라우트    | `routes.add({ method, path, access })`                                               | `/api/plugins/<id><path>` 에 마운트. `access: 'admin'` 은 세션과 `plugins.manage` 권한 필요                                                                                                                                                                                                                                                                                                                  |
| 설정      | `settings.get/all`                                                                   | manifest 의 `settings` 필드 값(기본값 적용). 관리자 화면이 자동으로 폼을 만듭니다                                                                                                                                                                                                                                                                                                                            |
| 저장소    | `storage.get/set/delete/keys`                                                        | 플러그인 전용 JSON KV. 플러그인 삭제 시 함께 삭제                                                                                                                                                                                                                                                                                                                                                            |
| 콘텐츠    | `content.list/getBySlug`                                                             | 발행된 콘텐츠 읽기 전용(필터 미적용)                                                                                                                                                                                                                                                                                                                                                                         |
| 로거      | `logger.info/warn/error`                                                             | `[plugin:<id>]` 접두사                                                                                                                                                                                                                                                                                                                                                                                       |

manifest의 `requires: { cms?: '<semver 범위>', plugins?: { '<id>': '<범위>' } }`가 맞지 않으면 활성화 대신 `failed`와 이유(코어 문구)를 보여 줍니다. 부팅 시 필요한 플러그인이 먼저 활성화됩니다. `updateUrl`(https, `{ "version", "download" }` 응답)을 적으면 관리자 화면에서 새 버전을 확인할 수 있습니다(자동 설치 없음).

타입 정의: `packages/sdk/src/plugin.ts`. 새 훅/슬롯은 `ActionHookMap`/`FilterHookMap`/`SLOT_NAMES`에 범용 이름으로 추가하고, 코어에서 발행 지점을 만들고, 이 표와 테스트를 갱신합니다.

## 콘텐츠

| 확장             | API                                          | 설명                                                                                                                                                                                              |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 콘텐츠 액션      | `hooks.on(name, handler)`                    | `content.scheduled`(예약 생성·변경), `content.revisionRestored`(복원 저장 후): 관리자 콘텐츠 DTO. `term.created/updated/deleted`: 저장 확정 뒤 관리자 용어 DTO                                    |
| 콘텐츠 정의 액션 | `hooks.on(name, handler)`                    | `contentType.created/updated/deleted`, `field.created/updated/deleted`: 저장 확정 뒤 정의 DTO. `permalinks.updated`: 경로 재생성 성공 뒤 설정 DTO                                                 |
| 콘텐츠 정의 필터 | `hooks.filter(name, handler)`                | `contentType.beforeSave`, `field.beforeSave`: 검증된 입력을 받고 결과를 동일 스키마로 재검증. 수정 시 기존 key 유지                                                                               |
| 용어 필터        | `hooks.filter(name, handler)`                | `term.beforeSave`(검증된 입력, 결과 재검증), `term.query`(관리자 목록의 분류), `term.public`(공개 단건·목록 DTO). 잘못된 결과는 무시                                                              |
| 콘텐츠 조회 필터 | `hooks.filter('content.query', handler)`     | 권한 확인 뒤 관리자 목록 조회 인자. 결과를 동일 스키마로 다시 검증                                                                                                                                |
| 콘텐츠 변경 액션 | `hooks.on(name, handler)`                    | `content.termsChanged`: 콘텐츠 저장 시 할당 ID 집합이 바뀐 경우 관리자 DTO. `content.revisionSaved`: 리비전이 저장된 콘텐츠 DTO. `content.autosaved`: `{ contentId, revision }` 관리자 리비전 DTO |
| 콘텐츠 주소 필터 | `hooks.filter('content.permalink', handler)` | 공개 단건·목록의 `{ contentId, path }`. 해당 콘텐츠가 소유한 현재·별칭 경로만 허용. 잘못된 결과는 경고 후 무시. 새 경로는 고유주소 토큰으로 생성                                                  |
| 콘텐츠 거부 필터 | `hooks.filter(name, handler)`                | `content.publishAllowed`, `content.deleteAllowed`: boolean, 코어 권한 확인 후 추가 거부만 허용. 앞선 거부를 true로 뒤집을 수 없음. 예약 발행과 휴지통 자동 정리에도 적용                          |

분류 용어를 삭제하면 `term.deleted`를 발행한 뒤, 영향을 받은 남은 항목마다 `content.termsChanged`를 발행합니다(관리자 DTO는 커밋 뒤에 읽음). 예약 발행과 휴지통 자동 정리는 영향을 받은 항목마다 수명주기 액션을 발행합니다.

`contentTypes.register(key, definition)`, `taxonomies.register(key, definition)`,
`fields.register(key, definition)`은 `plugin:<plugin-id>:<key>` 아래에 스키마로 검증되는
정적 정의를 선언합니다. 코어 콘텐츠 유형과 카테고리/태그 분류도
같은 등록소를 사용합니다. 등록을 해제하면 저장된 콘텐츠·용어·할당·필드 값은 삭제하지 않고
선언만 숨깁니다. 비활성 플러그인의 필드는 공개 출력에서 빠지지만 그 값은 이후 검증을 거쳐도 보존됩니다.
관리자가 정의를 저장할 때는 플러그인 네임스페이스를 사용할 수 없습니다. 이 선언에는
런타임 콜백이 없으며, 활성화와 그 등록은 호스트의 기존 격리와 범위(scope) 정리를 그대로 사용합니다.

`permalinkTokens.register(key, resolver)`는 복사된 `PermalinkValues` 객체로 `%key%`를 해석합니다.
플러그인 결과는 디코딩된 안전한 세그먼트여야 합니다. 구분자, 점 세그먼트, 제어 문자,
퍼센트 기호는 거부되고, 허용된 텍스트는 한 번 인코딩됩니다. 호출은 격리되고 시간이 제한됩니다.
실패하면 같은 이름의 코어 토큰으로, 사용자 정의 토큰이면 빈 텍스트로 대체됩니다. 해제하면 리졸버가 제거됩니다.
코어 토큰도 같은 조회를 사용하며, 카테고리/페이지 계층 토큰은 기존의 다중 세그먼트 동작을 유지합니다.

카테고리와 작성자 변경은 메타데이터 트랜잭션 안에서 코어 토큰 경로를 갱신합니다.
사용자 정의 토큰 경로는 콘텐츠 ID를 병합해 큐에 넣습니다(대기 중인 전체 재생성은 전체 재생성으로 유지).
커밋 뒤 저장소는 기다리지 않고 재생성을 시작하며, 실패하면 5초 주기 스케줄러가 재시도합니다.
콘텐츠 저장은 계속 가능합니다. 저장 시 자체 경로를 계산하고 대기 중인 워커 진행분을 무효화하며,
워커의 스냅샷은 커밋 전에 경로 잠금 아래에서 다시 확인합니다. 이전에 발행된 경로는 리다이렉트로 남습니다.

## 미디어

코어 크기를 포함해 서로 다른 이미지 크기 이름은 최대 32개까지 활성화됩니다. 먼저 등록된 서로 다른 이름이 남은 자리를 차지하고, 초과한 이름은 로그에 기록되며 `list()`에서 빠집니다. 이는 파생 이미지 작업량과 TEXT 열에 저장되는 variants JSON의 크기를 제한합니다. 처리 결과가 너무 큰 원본은 업로드 원본에 대한 코어 정리로 대체됩니다.

이미지 크기 선언은 이름을 `[a-z][a-z0-9-]{0,63}`로, 크기를 1~8192픽셀 정수로 검증합니다. `height`는 선택이며 `crop`의 기본값은 false입니다. 자르기는 가운데 기준 cover 맞춤을 사용하고, 자르지 않으면 가로세로 비율을 유지하며 요청한 범위 안에 맞춥니다. 어느 쪽도 원본을 확대하지 않습니다. 플러그인을 비활성화하면 선언은 제거되지만 이미 생성된 파일은 그대로입니다.

`mediaProcessors.register({ process({ bytes, mime }) })`는 JPEG/PNG/WebP/AVIF 업로드의 최적화 바이트를 반환합니다. 호출은 복사·시간 제한·반환값 검증을 거치며 실패/비활성화는 이전 바이트로 진행합니다. 같은 처리 계약의 코어 재인코딩은 컴포지션 루트 전용 `registerCore`로만 등록되고(플러그인 등록 API로는 접근 불가) 마지막에 격리 없이 직접 실행되므로 메타데이터 제거를 우회하지 못합니다. 코어가 디코딩하지 못하는 플러그인 출력이나 처리된 바이트의 업로드 크기 제한 초과는 잘못된 플러그인 출력으로 보고 원본으로 코어 재인코딩합니다. 원본에 대한 코어 실패(또는 코어 미등록)는 숨기지 않고 업로드 오류로 전달합니다. SVG·GIF·문서/오디오/비디오는 아직 이 파이프라인 대상이 아닙니다.

알려진 미디어 출력 확장 공백: `media.public`은 아직 연결되지 않았습니다. 공개 이미지 DTO가 콘텐츠의 공개 SQL projection과 미디어 저장소 조회에서 각각 만들어지며 동기 매퍼에 비동기 훅을 넣을 수 없습니다. 콘텐츠·테마·사이트 출력 경계의 공통 비동기 projection 계약을 연결해야 하며, 일부 경로에만 필터를 적용하지 않습니다.

미디어·토론 추가 훅: `media.updated`(메타데이터 커밋 뒤 AdminMedia), `discussion.updated`(설정 저장 뒤 DiscussionSettings); `media.beforeSave`(메타데이터 입력 재검증), `media.filename`(저장 경로가 아닌 표시 이름), `media.uploadAllowed`(코어 업로드 검사 뒤 파일 이름·MIME·크기와 거부 전용 allowed), `discussion.beforeSave`(설정 입력 재검증).

`imageSizes.register({ name, width, height?, crop? })`는 이미지 크기를 등록합니다. 코어 크기는 플러그인 API가 아니라 등록소 자체에서 선언되며 충돌 시 우선합니다. 코어 크기 이름에 대한 플러그인 등록은 경고와 함께 거부되므로 플러그인은 없는 이름만 추가할 수 있습니다. 같은 이름을 여러 플러그인이 등록하면 마지막 등록이 우선하고, 등록을 해제하면 이전 등록이 복원됩니다. 업로드 시 활성 크기가 생성되며, 플러그인을 비활성화하면 이후 생성만 멈추고 기존 파생 이미지는 삭제하지 않습니다. `POST /api/v1/admin/media/:id/derivative?name=…`(인증 필요)는 저장하지 않고 캐시할 수 없는 WebP를 반환합니다. 웹의 미디어 선택기와 에디터 이미지 크기 선택은 플러그인 크기를 포함해 미디어 DTO의 `variants`를 나열합니다(연동 완료).

## 댓글

모더레이터는 `commentCheckers`를 건너뛰지만 `comment.beforeSave`는 여전히 실행됩니다. `comment.notification.to`는 코어 수신자로 고정되며, 필터는 subject/text만 바꿀 수 있습니다. 수신자가 바뀌면 필터 결과는 무효가 됩니다.

`PluginComment`(댓글 액션), `CommentCheck.comment`, `comment.beforeSave` 초안에는 `authorEmail`처럼 비공개 `authorIp`와 `authorUserAgent`(증명되지 않으면 null)가 들어 있으며, 스팸 방지 검사와 스팸/정상 신고에 사용합니다. 이 값은 `comment.public`에 나타나지 않으며, 플러그인도 공개로 노출하면 안 됩니다([댓글](../features/comments.md#작성자-ip-주소와-사용자-에이전트)). WXR `import.item`/`export.data` 댓글은 선택 항목인 `authorIp`/`authorUserAgent`를 받습니다.

`commentCheckers.register({ check(input) })`는 `{ status: 'approve' | 'hold' | 'spam', reasons: string[] }`을 반환합니다. 코어 토론 정책도 같은 등록소에 컴포지션 루트 전용 `registerCore`로 등록되며 가장 엄격한 판정을 합칩니다. 코어 검사기는 격리 없이 직접 실행되고 예외·잘못된 반환값은 그대로 전달되어 댓글 제출이 실패합니다(승인으로 바뀌지 않음). 플러그인 실패·시간 초과·잘못된 반환값은 무시하고 비활성화 때 등록을 해제합니다. 기존 `comment.beforeSave`는 이 판정 뒤에 그대로 실행됩니다.

| 댓글 확장 | 계약                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 액션      | `comment.updated`, `comment.deleted`: 커밋된 댓글; 삭제는 단건·일괄·자동 정리 포함. 답글은 기존 `comment.created`의 `parentId`로 식별. 상태 변경은 기존 `comment.statusChanged`를 항목별 발행.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 필터      | `comment.query`: 관리자 목록 조건, `comment.public`: 공개 댓글 DTO, `comment.notification`: 발송 전 to/subject/text(작성자·답글·요약 메일 공통), `comment.push`: 큐에 넣기 전 브라우저 푸시 `{ title, body, url, tag, icon? }`(title/body만 변경 가능, url·tag·icon은 코어 고정), `comment.submitAllowed`: 코어 검사 이후 contentId/authorName/authorEmail/address와 거부 전용 allowed.                                                                                                                                                                                                                                                                                  |
| 저장소    | `context.storageDrivers.register(key, { label, fields, connect(settings) })`는 `plugin:<owner>:<key>`를 등록합니다. `PluginStorageDriver`, `MediaStorageDriver`, `StorageDriverRegistrar`는 `@cms/sdk/plugin`에서 내보냅니다. 반환된 어댑터는 `commit`, 범위 지정 `read`, 멱등한 `remove`를 구현합니다. 코어 등록은 노출되지 않으며, 범위(scope)를 해제하면 가져간 어댑터는 대체 없이 회수됩니다. 설정 필드는 메일 전송 유형을 따르고, 비밀 값은 봉인되어 DTO 값에서 제외됩니다. 제공자 설정이 바뀐 뒤에도 기존 키는 계속 읽을 수 있어야 합니다. 로컬/S3 인벤토리 재동기화는 코어 전용이며, 플러그인 어댑터는 현재 전달과 정리만 제공하고 목록 열거는 제공하지 않습니다. |

토론 설정 훅(`discussion.updated`, `discussion.beforeSave`)은 미디어 절의 “미디어·토론 추가 훅”에 함께 있습니다.

## 사용자

캡차 제공자는 `label`, `verify`와 함께 `widget: { script, render, origins, attributes, responseField }`를 선언할 수 있습니다. 코어 Turnstile/hCaptcha/reCAPTCHA 등록도 같은 디스크립터를 사용합니다. `script`는 자격 증명이 없는 HTTPS URL이어야 하고(최대 2048자, 프래그먼트 없음), `attributes`는 `data-*` 이름 최대 20개(이름 최대 80자)와 문자열 값(최대 1024자)을 허용하며, `responseField`는 `[A-Za-z][A-Za-z0-9_-]*`(최대 100자)와 일치해야 합니다. 공개 DTO에는 파생된 `scriptOrigin`이 추가됩니다. 이 스크립트는 플러그인이 등록하는 신뢰된 스크립트이며 샌드박스 코드가 아닙니다. 속성에 비밀 값을 넣으면 안 됩니다. 비활성화하면 위젯도 검증기와 함께 철회되며, 덮어쓴 등록이 이전 등록의 위젯을 실수로 물려받는 일은 없습니다.

`render`의 기본값은 null(자동 렌더링)입니다. 그렇지 않으면 점으로 구분된 전역 함수 경로이며, 최대 256자이고 `^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*){0,3}$`와 일치해야 합니다. eval 없이 해석하고, 스크립트가 준비된 뒤 마운트마다 `fn(container, { sitekey, callback })`을 호출합니다. 코어 경로는 `turnstile.render`, `hcaptcha.render`, `grecaptcha.render`이며 명시적 렌더링용 스크립트 URL을 사용합니다. 자동 위젯은 data 속성으로 초기화되어 `responseField`를 채웁니다. 선언에 `data-size`가 없고 마운트 시 측정한 컨테이너 폭이 일반 크기 위젯(가장 넓은 reCAPTCHA 304px)보다 좁으면, 스크립트가 보기 전에 컨테이너에 `data-size="compact"`를 설정하고 `render`에도 `size: 'compact'`를 전달합니다(Turnstile/hCaptcha/reCAPTCHA 공통 값이며, 모르는 위젯은 무시). 아직 그려지지 않아 폭이 0으로 측정되는 컨테이너는 공급자 기본 크기를 씁니다. 선언한 `data-size`는 항상 그대로 두고, DOM 속성을 읽지 않는 명시적 렌더러(reCAPTCHA)를 위해 같은 값을 `render`의 `size`로도 전달합니다. API는 `data-sitekey` 속성이 없을 때만 공개 사이트 키를 그 속성으로 추가합니다(따라서 공개 맵에는 21개 항목이 있을 수 있음).

`origins`의 기본값은 `[]`이며 HTTPS CSP origin을 최대 10개(각각 최대 2048자) 담습니다. 경로, 자격 증명, 쿼리, 프래그먼트, 지시문 구문은 넣을 수 없고, `https://*.hcaptcha.com`처럼 맨 앞 와일드카드 서브도메인은 허용됩니다. `scriptOrigin`과 이 호스트들의 합집합은 사이트 전체가 아니라 캡차 페이지의 script/frame/connect 지시문에만 적용하세요. hCaptcha는 이 호스트를 style-src에도 쓰도록 문서화하고 있으며, Turnstile 사전 승인(pre-clearance)에는 페이지에 이미 있는 connect-src `'self'`가 필요합니다. 디스크립터 데이터를 근거로 unsafe-inline/unsafe-eval을 추가하지 마세요.

코어 CSP 출처는 [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [hCaptcha](https://docs.hcaptcha.com/#content-security-policy-settings), [Google reCAPTCHA](https://docs.cloud.google.com/recaptcha/docs/faq) 문서와 대조해 확인했습니다. Turnstile은 `https://challenges.cloudflare.com`, hCaptcha는 `https://hcaptcha.com`과 `https://*.hcaptcha.com`, reCAPTCHA는 `https://www.google.com`, `https://www.gstatic.com`, `https://recaptcha.google.com`을 사용합니다. Google이 문서화한 경로 단위 출처는 이 계약에서 origin으로 표현합니다.

플러그인 manifest id `core`는 예약되어 있어 설치 시 거부됩니다. 코어 개인정보 삭제 처리기와 캡차 검증기는 컴포지션 루트 전용 `registerCore` 메서드로 들어오며, 플러그인 등록기는 접근할 수 없습니다. 소유자 이름이나 `core:` 접두사만으로는 코어 실행 권한이 생기지 않습니다. 코어 캡차는 플러그인 격리 제한 시간이 아니라 자체 HTTP 타임아웃을 사용합니다.

개인정보 삭제 처리 결과에는 `messages`도 담깁니다(문자열 최대 20개, 각각 최대 500자; 생략하면 `[]`). 이 값은 검증되어 제공자별 보고서에 포함됩니다. HTML이 아니라 일반 텍스트로 취급하세요. 웹의 개인정보 삭제 처리 화면은 모든 개인정보 삭제 처리기의 개수, 메시지, 실패를 표시합니다(연동 완료).

- `roles.register({ key, name, capabilities })`는 기본 제공 역할과 같은 등록소로 역할 기본값을 추가합니다. 먼저 등록한 것이 우선하며, 관리자가 저장한 덮어쓰기와 삭제 표시(tombstone)가 더 높은 우선순위를 가집니다. 비활성화하면 저장되지 않은 기본값만 철회되고, 사용자나 관리자가 저장한 역할은 그대로입니다.
- `profileFields.register(key, { label, type, ...bounds })`는 비공개 `pluginId:key` 메타데이터(`text`, `number`, `boolean`)를 선언합니다. 계정/관리자 API가 값을 검증해 사용자별로 저장합니다. 비활성화된 필드는 저장된 채로 개인정보 내보내기/삭제에 포함되지만 표시되거나 쓸 수는 없습니다.
- `captchaProviders.register(key, { label, verify })`는 `plugin:<id>:<key>` 제공자를 추가하며, 기본 제공 키 `turnstile`, `hcaptcha`, `recaptcha`도 덮어쓸 수 있습니다. 코어도 같은 API로 등록합니다. 예외, 시간 초과, 잘못된 출력, 회수된 등록은 해당 제공자의 이전 구현으로 대체됩니다. 유효한 구현이 없으면 검증이 실패하며 우회되지 않습니다. 유효한 `false`는 제공자 실패가 아니라 거부입니다.
- `privacyErasers.register(key, { erase(request) })`는 멱등한 개인정보 삭제 처리기를 등록하며 `{ erased, retained }`를 반환합니다(단위는 제공자가 정의하고, 코어는 대상(subject) 수를 셈). 코어가 등록소를 통해 먼저 실행되어 트랜잭션/마지막 관리자 보호 장치를 유지합니다. 플러그인 호출은 격리되고 검증됩니다. 개인정보 삭제 처리 응답은 `results`와 `failed` 제공자 ID를 보고하며, 플러그인 실패가 코어 개인정보 삭제 처리를 되돌리지는 않습니다. 시간 초과/해제 시점에 이미 실행 중인 콜백은 취소할 수 없습니다. 실패한 개인정보 삭제 처리기는 운영자의 후속 조치가 필요하며, 코어 개인정보 삭제 처리가 끝났다고 해서 플러그인 데이터가 삭제되었다는 증거는 아닙니다.

| 확장             | API                                       | 설명                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 사용자 관리 액션 | `hooks.on(name, handler)`                 | `user.created/updated/roleChanged/deleted`, `role.created/updated/deleted`, `security.updated`. 저장 성공 뒤에만 발행하며 비밀 값은 제외. 삭제는 `reassignTo`, 역할 변경은 `previousRole` 포함                                                    |
| 사용자 필터      | `hooks.filter(name, handler)`             | `user.beforeSave`(create/update/profile/role; 비밀번호 제외, 작업·대상 고정), `user.query`(관리 목록 role/search), `user.public`(공개 저자 DTO), `user.registrationAllowed`(거부 전용), `user.capabilities`(아래 권한 정책). 잘못된 반환값은 무시 |
| 개인정보 훅      | `hooks.on` / `hooks.filter`               | `privacy.requested/exported/erased`는 커밋된 요청 DTO(토큰 제외). `privacy.exportData`는 확인된 요청의 `data`에 플러그인 개인정보를 추가하며 코어 스트림을 대체하지 않음(직렬화 가능한 JSON, 최대 1 MiB). 요청 식별자는 고정                      |
| 차단 액션        | `hooks.on('protection.blocked', handler)` | 작업·차단 사유와 계정/주소의 도메인 분리 HMAC만 전달. 원문 계정·IP·캡차 토큰·비밀은 제외                                                                                                                                                          |

`user.capabilities`는 신뢰하는 서버 플러그인에 한해 WordPress `user_has_cap`처럼 권한 추가·제거를 허용합니다. 인증이 확인된 사용자만 평가하며 익명은 훅을 실행하지 않고 권한이 없습니다. 선언된 capability 카탈로그에 없는 권한과 사용자/역할 식별자 변경은 거부합니다. 역할 자체의 권한을 넘는 추가는 `(plugin, user, capability)`별 프로세스 수명 동안 한 번 `warn`으로 기록합니다(정책 거부 전용 필터와는 별도). 선언된 capability 카탈로그는 아래 capability 등록소입니다. `RoleService.capabilities(role, userId)`에 인증된 id를 전달해야 필터가 적용됩니다.

`user.beforeSave`는 자격 증명이 없는 create/update/profile/role 입력을 필터링하며, 작업과 대상 식별자는 고정됩니다. `user.query`는 관리자 role/search 조건을 필터링합니다. `user.capabilities`는 인증이 확인된 사용자에 한해서만 권한 추가와 제거를 허용합니다. 알 수 없는 권한은 거부되고, 역할 권한을 넘는 추가는 (플러그인, 사용자, 권한)별로 프로세스당 한 번 `warn` 수준으로 기록됩니다. `privacy.requested/exported/erased`는 커밋된 토큰 없는 요청 DTO를 발행하고, `privacy.exportData`는 코어 섹션을 대체하지 않고 크기가 제한된 JSON 확장을 추가합니다. `protection.blocked`는 작업, 사유, 도메인 분리된 계정/주소 HMAC을 노출하며 원문 식별자는 노출하지 않습니다.

권한(capability) 등록소: `capabilities.register({ key, label })`는 권한을 선언하며 비활성화하면 회수됩니다. 코어 권한도 같은 등록소를 사용하며 가려질 수 없습니다. 관리자는 등록된 권한을 사용자 지정 역할에 부여할 수 있습니다. 선언되지 않은 권한은 거부되고, 등록이 제거되면 더 이상 권한이 부여되지 않습니다. `GET /api/v1/admin/capabilities`가 이 목록을 반환합니다([라우트](../api/routes.md) 참고). 웹의 역할 편집기는 이 목록으로 권한 이름을 표시하고, 플러그인 권한을 출처별로 묶으며, 플러그인이 기여한 역할을 표시합니다(연동 완료).

## 외관

테마 템플릿과 파트가 플러그인 기여보다 우선합니다. 기여는 없는 템플릿 이름/파트 slug만
추가하며, 관리자가 저장한 커스터마이징이 가장 높은 우선순위를 가집니다. 플러그인 패턴은
등록이 성공하기 전에 활성 블록 속성 검증과 에디터 렌더러의 스키마 검사를 통과해야 합니다.

`PluginContext`의 계약은 `menuItemTypes.register(key, resolver)`,
`themeContributions.register(key, provider)`, `patterns.register(key, definitions)`입니다.
코어 메뉴 유형과 기본 테마 기여도 같은 등록소를 사용합니다. 코어
메뉴 유형은 컴포지션 루트 전용 `registerCore`로 들어오고, 플러그인 격리 없이 실행되며
키가 충돌하면 우선합니다. 코어 메뉴 유형 키(`home`, `custom`, `archive`, `content`, `term`)에 대한
플러그인 등록은 경고와 함께 거부됩니다. 모든 등록은 범위(scope)가 소유합니다. 비활성화/언로드하면
진행 중인 결과를 포함해 회수됩니다. 제공자의 예외, 시간 초과, 잘못된 출력은 이전 등록으로
넘어갑니다. 알 수 없는 플러그인 메뉴 유형은 저장된 배치를 삭제하지 않고 사라집니다.
패턴 기여는 저장되지 않는 삽입용 에디터 문서이며, 저장된/동기화된 패턴과 따로 노출됩니다.

웹(연동 완료): 블록 삽입기는 기여된 패턴을 플러그인별 라벨과 함께 나열하고 사본을 삽입합니다.
메뉴 편집기는 플러그인 항목 유형마다 객체 선택기(선언한 경우 검색 가능)를 제공하고, 용어 선택기에
플러그인 분류를 제공합니다. 사이트 편집기는 저장된 커스터마이징이 덮어쓰기 전까지
플러그인 템플릿/파트를 “플러그인: <id>”로 표시합니다.

| 외관 / 탐색 훅                                                  | 계약                                |
| --------------------------------------------------------------- | ----------------------------------- |
| `theme.activated/installed/deleted`                             | 저장된 AdminTheme                   |
| `template.updated`, `templatePart.updated`, `styles.updated`    | 초기화를 포함한 저장된 커스터마이징 |
| `menu.created/updated/deleted`, `menu.beforeSave`, `menu.items` | 메뉴 수명주기, 입력, 출력           |
| `widgets.updated`, `widgets.beforeSave`                         | 배치 설정                           |
| `pattern.created/updated/deleted`, `pattern.beforeSave`         | 트랜잭션 이후 DTO와 검증된 입력     |
| `settings.updated`                                              | 읽기/쓰기 설정 섹션과 해당 설정값   |

## SEO

`feed.*`, `robots.txt`, `llms.txt`, `seo.meta`, `seo.markdown`, 플러그인
사이트맵 종류는 **웹에 연동되어 있습니다**. 피드, 댓글 피드, robots.txt,
llms.txt, `.md` 보기, 모든 공개 페이지의 meta/JSON-LD는
`seo.filterBatch`를 거치며(문서 또는 페이지당 한 번 호출; `#lib/server/seo-filter.js`),
사이트맵 인덱스는 `seo.providers()`의 모든 종류를 나열합니다. 필터 RPC가 403, 429 또는
5xx 응답을 반환하면 웹은 필터링되지 않은 값을 사용해야 합니다.
코어 등록소 제공자는 격리나 시간 제한이 없으며, 오류는 그대로 전파됩니다.

`sitemaps.register(key, provider)`는 페이지 단위 제공자를 추가하거나 교체합니다.
코어 `content`, `category`, `tag`, `author`, `taxonomy` 제공자도
이 계약으로 등록됩니다. 제공자는 `{ page, pageSize, siteUrl }`을 받아
`{ items, total }`을 반환하며, 항목은 `seoSitemapEntrySchema`를 따릅니다. 키는
`GET /api/v1/seo/providers`로 나열하고 페이지는 `GET /api/v1/seo/sitemap?kind=key`로 가져옵니다.
`sitemap.entries`는 반환된 각 페이지에 한 번 적용됩니다.

| SEO / 탐색 훅                                                                 | 계약                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| `seo.updated/beforeSave/public`                                               | 설정 훅                                      |
| `sitemap.entries`, `feed.items/channel`, `robots.txt`, `llms.txt`, `seo.meta` | 검증된 탐색 출력                             |
| `seo.markdown`                                                                | 신뢰된 프런트엔드 RPC를 통한 Markdown 문자열 |

Markdown 보기는 렌더링된 공개 Markdown 문자열을 `{ kind: 'seo.markdown', value }`로
신뢰된 프런트엔드 필터 RPC에 제출한 뒤 `.md` 응답을 반환합니다.
같은 검증/대체 규칙이 적용됩니다.

피드 유형 등록소는 제공하지 않습니다. 최종 피드 라우팅과 직렬화는
웹 앱에 있으므로, API 전용 등록소는 웹이 제공할 수 없는 유형을 알리게 됩니다.
기존 `feed.items`와 `feed.channel` 필터가 콘텐츠 피드와 댓글 피드를 다룹니다.
피드 유형을 추가하려면 동작하지 않는 API 등록이 아니라 프런트엔드 라우팅과
직렬화기 계약을 함께 정해야 합니다.

탐색 연동: `GET /api/v1/seo/sitemap`의 사이트맵 페이지에는 이미
`sitemap.entries`가 적용됩니다. 다른 프런트엔드 직렬화기는 XML/HTML을 이스케이프하거나 텍스트를
반환하기 전에 `{ kind, value }`를 `/api/v1/seo/filter`로 POST해야 합니다. SDK 플러그인
export `discoveryFilterSchemas`가 각 값을 정의합니다. 피드 항목은
`id/title/link/description/publishedAt/author?`를, 채널은
`title/link/description/language?`를, meta는
`title/description/canonicalUrl/og/jsonLd`를 사용합니다. 게시물 피드와 댓글 피드 모두 이
계약을 따릅니다. 텍스트 값은 문자열입니다. 공개 표시용 데이터만 제출하세요.

필터 RPC에는 `SSO_FRONTEND_SECRET_HEADER`와 유효한
`SSO_CLIENT_ADDRESS_HEADER`가 모두 필요합니다. `ClientResolver`는 기존의
상수 시간 다이제스트 비교로 비밀 값을 확인합니다. 증명이 없거나 유효하지 않으면 본문을
읽거나 플러그인을 실행하기 전에 거부(forbidden)됩니다. 요청은 512 KiB 제한으로 스트리밍되며, 각 API
프로세스는 증명된 방문자 네트워크당 분당 6,000회, 전체 60,000회 호출을 허용합니다.
XML/HTML/JSON-LD 이스케이프는 여전히 웹 직렬화기의 책임입니다.

## 검색

`search.indexed`는 엔진 쓰기, 아웃박스 확인, 동기화 상태 저장이 모두 성공한 뒤
발행됩니다. 페이로드는 `{ operation: 'rebuild' | 'update', contentIds }`이며,
`contentIds: null`은 전체 재생성을 뜻합니다. 증분 ID에는 삭제된 항목도 포함됩니다.
실패한 동기화와 빈 동기화는 이를 발행하지 않습니다. 연결 비밀 값은 노출되지 않습니다.

`searchEngines.register(key, engine)`는 검증된 검색 인자를 받아
순위가 매겨진 `{ ids, total }`을 반환하거나, 처리하지 않으려면 `null`을 반환합니다. 마지막 등록이
먼저 시도되며, 코어 Meilisearch와 데이터베이스 제공자도 같은 등록소를 사용합니다. 실패,
시간 초과, 잘못된 결과, 회수가 발생하면 다음 제공자를 시도합니다. 공개 요약은
항상 발행된 콘텐츠 리더를 통해 채워집니다. 가속기 계약 밖의 쿼리(예: 작성자 범위)는
DB 직접 경로를 유지합니다.
쿼리/결과 훅은 두 경로를 정확히 한 번씩 감싸며, 결과 필터는 현재 페이지 ID의 순서를 바꾸거나
제거할 수 있지만 그 페이지 밖의 ID를 추가할 수는 없습니다.

| 검색 훅                         | 계약                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `search.query/results/document` | 공개 검색 쿼리, 순위가 매겨진 ids/total, 색인된 공개 문서. 문서 식별자는 변경할 수 없음 |

## 플랫폼

보안 및 출력 제한:

- `email.beforeSend`는 수신자를 변경할 수 없습니다. 비밀번호 재설정/초대, 복구,
  개인정보 메일은 `sensitive`로 표시되어 `email.beforeSend`에 전달되지 않습니다.
  제목과 본문에 토큰이 들어 있으므로 필터 없이 발송됩니다.
- `import.item`과 `content.beforeSave`에는 비밀번호가 없습니다. 코어가 필터 전에 항목의
  비밀번호를 제거하고 이후 원래 값을 다시 적용하므로, 필터는 비밀번호를
  읽거나 설정하거나 바꿀 수 없습니다.
- 코어 액션 구독(코어 웹훅)은 `HookBus.core`로 등록하며, 플러그인 컨텍스트는
  이를 받지 못합니다. 이들은 격리나 시간 제한 없이 직접 실행되고
  `emit`이 기다립니다. 실패는 코어 오류로 기록되고 `emit`을 거부합니다. 발행자는
  커밋 뒤 기다리지 않고 발행하므로, 커밋된 요청이 실패로 보고되지는 않습니다.
- `email.sendAllowed`는 `{ to, subject, allowed }`를 받습니다. 거부는
  되돌릴 수 없으며 작업을 재시도하지 않고 영구 실패로 처리합니다.
- `webhook.payload`는 `data`만 필터링하며 코어가 id/event/occurredAt을 유지합니다.
  직렬화된 전달은 64 KiB로 제한됩니다(크기를 넘긴 필터 출력은 무시).
- `dashboard.data`는 `{ widgets, capabilities }`를 받습니다. 권한이 있고 변경되지 않은 위젯의
  제거/순서 변경만 허용되며, 식별자/내용/권한 변경과
  중복 위젯은 거부됩니다.
- `export.data`가 추가하는 항목은 직렬화된 JSON 기준 합계 16 MiB로 제한됩니다.
- 플러그인 메일의 기본 전달 제한 시간은 60초이며 짧은 훅 타임아웃이 아닙니다.
  시간 초과된 외부 작업은 취소할 수 없으므로, 재시도 시 중복 전달을 피하려면
  가능한 한 전송기가 멱등성을 갖추는 것이 좋습니다.
- 상태 점검 상세 정보는 문자열 100개, 각각 최대 2,048자로 제한됩니다.
- 플러그인 작업 입력은 직렬화된 UTF-8 JSON 64 KiB로 제한됩니다. 코어는 스키마가 변환한
  출력이 아니라 검증된 복제 입력을 저장합니다. 실행 시 다시 검증합니다.
  키 복구에는 플러그인을 포함해 현재 등록된 모든 작업 종류가 포함됩니다.

### 사이트 상태 점검

`context.healthChecks.register(key, check)`는 `plugin:<id>:<key>`를 등록합니다.
콜백은 `{ status: 'good' | 'recommended' | 'critical', detail: string[] }`을 반환합니다.
코어 점검 일곱 개는 모두 코어 전용 `registerCore` 경로로 같은 등록소를 사용합니다
(플러그인 컨텍스트는 네임스페이스가 붙은 플러그인 등록에만 접근). 코어 점검은
격리나 시간 제한 없이 직접 실행되며, 오류는 전파되어 보고서를 실패시킵니다.
플러그인 결과는 검증되고 호출에는 시간 제한이 있습니다. 예외를 던지거나, 잘못되었거나,
시간 초과된 플러그인 점검은 critical `check failed` 결과가 되며, 예외 세부 정보는
응답에 나타나지 않습니다. 비활성화하면 점검이 회수되고 늦은 등록은
거부됩니다.

### 일회성 플러그인 작업

`context.jobs.register(kind, { schema, run })`은 kebab-case 로컬 종류를
`plugin:<id>:<kind>`로 등록합니다. `schema`는 zod 스키마이고, `run`은 검증된 JSON을 받습니다.
`context.jobs.enqueue(kind, payload, { delayMs? })`는 모든 페이로드를 영구 저장소에 넣기 전에
검증하고 봉인합니다. 지연의 기본값은 0이며 최대
2,147,483,647밀리초입니다. 핸들러는 코어 작업 러너의 임대(lease)와 재시도
정책을 사용하며 실행 제한은 60초입니다. 플러그인을 비활성화하면 등록이 회수되고
늦은 enqueue 호출은 거부됩니다. 핸들러가 더 이상 등록되어 있지 않은 대기 작업은
비활성화된 코드를 실행하지 않고 알 수 없는 종류로 실패합니다.

| 확장        | API                           | 설명                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 플랫폼 액션 | `hooks.on(name, handler)`     | `email.sent/failed`(수신 주소만), `email.settingsUpdated`, `job.failed`, `webhook.created/updated/deleted/delivered/failed`, `plugin.installed/activated/deactivated/removed/upgraded`(id·version·status만), `import.completed`, `export.generated`(WXR 스트림 완료), `site.installed`(사이트 정보만), `egress.updated`. 비밀 값 제외, 저장 성공 뒤 발행 |
| 플랫폼 필터 | `hooks.filter(name, handler)` | `email.beforeSend`(to·subject·text 검증, 민감 메일 제외), `email.sendAllowed`(거부만), `webhook.payload`(JSON 객체), `export.data`(코어 스트림 뒤에 추가할 WXR 항목 배열), `import.item`(항목별, 날짜는 Date, 비밀번호 제외), `dashboard.data`(권한 검사 뒤 위젯 배열). 잘못된 반환값 무시                                                               |

메일 전송기: 기존 `transport: 'smtp' | 'http'`와 제공자는 바뀌지 않습니다. 선택 항목인 `pluginTransport`(입력 `{ id, values, secrets }`, 출력 `{ id, values, secretsConfigured } | null`)가 이를 덮어쓰며, `null`이면 기존 전송기를 선택합니다(웹: 메일 설정 화면에 연동 완료). 코어가 비밀 값을 봉인합니다. 생략된 키는 유지되고 `''`는 해당 키를 제거하며, 전송기 id를 바꾸면 자격 증명을 재사용하지 않습니다. `availableTransports: { id, label, fields }`는 선택지를 나열하고, 필드는 `{ key, label, type: text | number | boolean | secret, required }`입니다. 선택한 플러그인 전송기가 실패하거나 제거되면 발송이 실패하고(평소처럼 재시도) 다른 제공자로 대체되지 않습니다. 플러그인은 `context.mailTransports.register(key, definition)`로 전송기를 등록합니다.

## 로그인

`user.secondFactorRequired`는 단조적입니다(양방향 아님). 플러그인은 요구 사항을 추가할 수 있지만 역할 정책이나 앞선 필터가 부과한 요구 사항을 해제할 수는 없습니다. 요구를 약화하는 결과는 무시되고 기록됩니다. 코어 UV 패스키 인증은 기본 요구 사항을 이미 충족한 것으로 간주하며, 플러그인은 여기에 추가 요소를 요구할 수 있습니다. `SignInRequest.client`는 증명된 정규화 방문자 키(IPv6 /64)를 담고, 증명되지 않았으면 null입니다. `address`는 속도 제한 키가 아닙니다.

로그인 수단과 2단계 인증 요소는 코어와 플러그인이 함께 쓰는 등록소입니다: `context.auth.signInMethod/secondFactor`, id는 `plugin:<id>:<key>`. 훅은 `user.signedIn`, `user.signInFailed`, `user.secondFactorChanged`이고, 필터는 `user.signInAllowed`(거부 전용)와 `user.secondFactorRequired`입니다. 자세한 내용은 [sign-in.md](../auth/sign-in.md)를 참고하세요.

## 확장 원칙 (WordPress 수준)

코어의 모든 동작은 **훅**(액션·필터)과 **계약**(등록소)으로 확장할 수 있어야 합니다. 새 기능이나 기존 동작을 바꿀 때 아래를 함께 만듭니다.

- **액션**: 상태를 바꾸는 모든 성공한 작업(생성·수정·삭제·상태 변경·설정 저장·로그인 등) 뒤에 `<대상>.<과거형>`(예: `term.created`, `menu.updated`, `user.roleChanged`)을 발행합니다. 저장이 확정된 뒤 발행하고, 페이로드는 관리자 DTO(비밀번호·해시·토큰·비밀 값 제외)입니다. 결과에 영향을 주지 않습니다.
- **필터**:
  - 저장 전 입력: `<대상>.beforeSave`. 검증된 입력을 받고, 결과는 같은 스키마로 다시 검증합니다.
  - 출력: 공개 응답·피드·사이트맵·메타 태그·메일 등 밖으로 나가는 값마다 `<대상>.public`, `<대상>.<출력>` 필터를 둡니다.
  - 조회 조건: 목록 조회 인자는 `<대상>.query`(WordPress `pre_get_posts`)로 바꿀 수 있습니다.
  - 허용 여부: 보안과 관련된 결정은 `<대상>.<행위>Allowed` 필터로 노출합니다. 플러그인은 **거부만** 할 수 있습니다.
- **계약(등록소)**: 교체하거나 추가할 수 있는 서비스는 `PluginContext`의 등록 API로 노출합니다(메일 전송, 검색 엔진, 캡차, 사이트맵 제공자, 로그인 수단 등). **코어 기본 구현도 같은 등록소에 같은 계약으로 등록합니다.** 플러그인 구현은 시간 제한 안에 격리 실행하고 결과를 zod로 검증합니다. 실패하거나 비활성화되면 코어 구현으로 돌아가며, 플러그인을 끄면 등록도 해제됩니다. 코어 구현은 플러그인용 시간 제한·격리를 거치지 않으며, 그 오류는 숨기지 않고 그대로 전달합니다(빈 결과로 바꾸지 않음). 테마·코어가 제공하는 항목과 플러그인 기여가 겹치면 테마·코어가 우선하고, 플러그인은 없는 항목만 추가합니다(관리자가 저장한 값은 항상 최우선).
- **범용성**: 이름과 페이로드는 [4.2절](../../AGENTS.md#42-코어--플러그인)대로 여러 종류의 플러그인이 쓸 수 있는 형태여야 합니다. 특정 플러그인 전용 훅은 금지합니다.
- **위치**: 분야별 훅은 `packages/sdk/src/hooks/<분야>.ts`에 `<Domain>ActionHooks`/`<Domain>FilterHooks` 인터페이스로 정의하고, `plugin.ts`의 `ActionHookMap`/`FilterHookMap`에 `&`로 합칩니다. 이 표에도 행을 추가합니다.
- **테스트**: 각 훅이 맞는 페이로드로 발행되는지, 잘못된 필터 결과가 무시되는지, 거부 전용 필터가 허용으로 바뀌지 않는지, 계약이 실패할 때 코어로 돌아가는지 확인합니다.
