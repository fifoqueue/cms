# 플러그인 확장 지점

상위 문서: [AGENTS.md](../../AGENTS.md)

모든 확장 지점은 범용이며, 도메인별로 나눠 정리했습니다. 새 행은 해당 도메인 아래에 추가하고, 도메인이 없으면 소제목을 새로 만듭니다. 확장 원칙은 [아래](#확장-원칙-wordpress-수준)에 있습니다. 작성 방법은 [authoring.md](authoring.md), 수명주기·격리는 [lifecycle-and-isolation.md](lifecycle-and-isolation.md)를 봅니다.

## 코어

### 훅 실행 인수와 순서

`hooks.on(name, handler, priority?)`와 `hooks.filter(name, handler, priority?)`는
낮은 우선순위부터 실행하며 기본값은 10입니다. 같은 우선순위에서는 등록 순서를 지킵니다.
액션도 순서대로 실행하지만 발행자가 `emit`의 Promise를 기다릴 필요는 없습니다.

코어의 필터 호출은 `applyFilter(name, value, accept, observe?, args?)`입니다.
기존 호출은 그대로 유효하며 핸들러는 `(value, ...args)`를 받습니다.
추가 인수 타입은 읽기 전용 배열이며 플러그인에는 복사본을 전달합니다.
신뢰된 functions 핸들러에는 원본을 전달하므로 컨텍스트를 변경하지 않아야 합니다.

신뢰된 필터의 반환값도 검증 전에 구조화 복사한 스냅샷으로 고정하며, 검증한
스냅샷만 다음 핸들러와 코어 관찰자에게 전달합니다. 추가 인수는 복사하지 않으며
핸들러가 없으면 스냅샷을 만들지 않습니다.

허용/거부 필터는 단조 규칙을 사용하지 않습니다. 코어 판단은 초기값일 뿐이며,
플러그인과 functions의 모든 핸들러가 `true` 또는 `false`를 반환할 수 있습니다.
`content.publishAllowed`, `content.deleteAllowed`, `media.uploadAllowed`,
`user.signInAllowed`, `user.secondFactorRequired`, `user.registrationAllowed`,
`comment.submitAllowed`, `comment.openAllowed`, `email.sendAllowed`, `term.deleteAllowed`에 적용됩니다.
회원가입 설정도 초기값만 결정합니다. 결과의 타입·구조 및 변경 불가 식별 필드 검증은 유지합니다.

`hooks.remove(name, handler)`는 해당 함수의 등록을 제거합니다.
`hooks.removeAll(name, priority?)`는 전체 또는 지정한 우선순위만 제거합니다.
두 메서드는 소유자에 관계없이 적용됩니다. 이미 실행 중인 핸들러를 취소하지는 않지만,
아직 호출하지 않은 제거된 핸들러는 건너뜁니다.
`hooks.has(name, handler?)`는 등록 여부를 반환하고 `hooks.did(name)`은 프로세스 내 발행 횟수입니다.
핸들러가 없는 발행도 횟수에 포함됩니다. 해제된 컨텍스트는 등록을 제거할 수 없습니다.

정의나 구독이 없는 사용자 정의 이름은 카운터를 보관하지 않습니다.
계약 해제 시 카운터도 삭제하며, 빈 구독 목록은 즉시 제거합니다.

`hooks.current()`는 현재 비동기 호출 경로의 훅 이름(없으면 `undefined`)을 반환합니다.
`hooks.doing(name?)`은 그 경로의 현재 또는 상위 훅이 실행 중인지 확인합니다.
동시에 실행되는 다른 요청의 훅은 보이지 않습니다. 훅이 끝난 뒤 남은 비동기 작업은
종료된 훅을 실행 중으로 보고하지 않습니다. 핸들러가 없으면 실행 컨텍스트를 만들지 않습니다.

분리된 비동기 콜백에서 다시 발행할 때 종료된 상위 프레임은 제거합니다.

### 사용자 정의 훅

`hooks.define(name, { kind: 'action' | 'filter', validate })`는 계약을 선언하고
해제 함수를 반환합니다. `validate(value)`는 동기 boolean 검증 함수입니다.
코어 훅 이름과 다른 소유자의 중복 선언은 거부합니다. 같은 소유자의 새 활성화 컨텍스트는
기존 계약을 교체할 수 있으며, 등록 커밋 실패 시 이전 계약으로 돌아갑니다.
같은 컨텍스트 안의 중복 선언은 먼저 해제해야 합니다.
`hooks.on(name, handler, priority?)`와 `hooks.filter(name, handler, priority?)`로 구독하며,
계약 선언 전에 구독해도 됩니다. 선언이 없거나 종류가 맞지 않으면 발행은 실행하지 않습니다.

`await hooks.do(name, payload)`는 액션을 발행하고,
`await hooks.apply(name, value, ...args)`는 필터 결과를 반환합니다.
사용자 정의 이름의 핸들러 입력·출력 타입은 `unknown`이므로 계약에 맞게 좁혀 사용합니다.
핸들러가 있을 때 입력과 각 필터 출력을 검증합니다. 잘못된 입력은 발행하지 않고
필터는 입력값을 반환하며, 잘못된 출력은 이전 값을 유지합니다. 검증 예외도 경고 후 무시합니다.
플러그인 핸들러는 복제·격리 규칙을 유지하고 신뢰된 핸들러는 직접 실행합니다.
플러그인이 선언한 검증 함수에는 복사본을 전달합니다.

사용자 정의 훅 입력은 검증 전에 독립적인 스냅샷으로 만들고, 검증한 바로 그 값을
발행합니다. 호출자가 검증 중 원본을 바꿔도 전달값은 변하지 않습니다.
이 경계의 스냅샷은 신뢰된 핸들러를 호출할 때도 유지됩니다.
플러그인 입력·출력과 사용자 정의 발행 입력은 `SharedArrayBuffer` 및 그 뷰를
중첩 객체·Map·Set·순환 참조 안에서도 거부합니다. 공유 메모리는 복제로 격리되지 않기 때문입니다.
핸들러가 없으면 스냅샷·검증·실행 컨텍스트를 만들지 않습니다.

컨텍스트의 모든 구독 및 선언 해제 함수는 scope가 추적합니다.
계약을 해제하면 해당 이름에 같은 활성화 컨텍스트가 등록한 구독만 제거됩니다.
이전 scope의 해제는 새 계약·구독이나 다른 소유자의 구독을 제거하지 않습니다.
다른 소유자의 구독은 계약이 없는 동안 대기하고, 같은 이름이 다시 정의되면 사용됩니다.

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
| 슬롯      | `slots.provide(slot, renderer)`                                                      | `head`, `body.open`, `body.close`, `site.header`, `site.footer`, `content.before`, `content.after`, `comments.before`, `comments.after`에 정제된 HTML 주입. `body.open`은 본문 시작, `body.close`는 본문 끝                                                                                                                                                                                                  |
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

### 페이지 렌더링과 라우팅

공개 SDK `createContentClient(...).pageRender(query)`는
`GET /api/v1/page-render`를 호출합니다. 응답은
`{ slots, bodyClasses, assets, headers, templateCandidates }`이며 `slots`는
`body.open`·`body.close`를 포함한 모든 슬롯의 합친 HTML 문자열입니다.
기존 `/api/v1/slots`는 슬롯별 문자열 배열을 유지합니다. 같은 요청 객체와
정규화된 쿼리의 렌더링 작업만 공유하며 요청 간에는 결과를 재사용하지 않습니다.

| 종류 | API / 훅                                                       | 계약                                                                                                                                            |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 필터 | `template.candidates`                                          | `{ page, candidates }`. 활성 테마의 템플릿 이름만 최대 64개 허용하며 순서 변경·추가·제거 가능                                                   |
| 필터 | `page.bodyClasses`                                             | `{ page, classes }`. 최대 128개, 토큰당 128자. 영문·`_`로 시작하고 영문·숫자·`_`·`-`만 허용                                                     |
| 등록 | `assets.register(key, { kind, src, placement, attrs, when? })` | `script`/`style`, `head`/`footer`. HTTPS 또는 같은 출처 플러그인 경로, 검증된 SRI·허용 속성만 전달. `when(page)` 격리 실행, 스코프 해제 시 제거 |
| 필터 | `response.headers`                                             | `{ page, status, headers }`. 일반 헤더 추가만 허용하며 기존 값·CSP·쿠키·보안 정책은 변경 불가                                                   |
| 등록 | `redirects.register(key, { resolve(path) })`                   | `{ to, status: 301\|302\|307\|308 }` 또는 `null`. 같은 출처 경로나 코어가 허용한 HTTPS 출처만 허용. 격리 실행·스코프 해제 적용                  |
| 액션 | `request.notFound`                                             | `{ path }`. 등록 리디렉션과 공개 콘텐츠가 모두 없는 경우 404 직전에 발행                                                                        |
| 필터 | `api.requestAllowed`                                           | `{ method, path, userId, client, allowed }`. `allowed`만 양방향 변경 가능하며 이후 라우트 인증·권한 검사는 생략하지 않음                        |
| 필터 | `api.responseHeaders`                                          | `{ method, path, status, headers }`. 일반 헤더 추가만 허용. 비공개 응답 캐시 정책과 보안 헤더 잠금 유지                                         |

`page`는 `{ kind, type?, slug?, status? }`이며 필터에서 문맥을 바꿀 수 없습니다.
등록 API는 플러그인과 사이트·테마 functions의 공통 컨텍스트에 있습니다.
자산 출처는 프런트엔드의 CSP 자산 목록에만 반영하며 헤더 필터로 CSP를 바꿀 수 없습니다.
자격 증명·세션·복구 코드·콘텐츠 열람 증명·미리보기 토큰·서명 비밀 값 응답은
필터 실행 전에 `private, no-store`로 표시합니다. 개인정보 확인 응답도 `no-store`입니다.
API 필터는 실제 상태 확인 경로 `/api/health`와 `/api/v1/auth/**`,
`/api/v1/install/**`에서 실행하지 않습니다. 핸들러가 없으면 사용자 조회·헤더 변환을 생략합니다.
세부 입력과 리디렉션 응답 형태는 [HTTP 라우트](../api/routes.md)를 봅니다.

## 국제화

`translations.register(locale, catalog)`는 `en`, `ko`별 번역을 등록합니다.
`catalog`에는 `site`, `admin`, `email` 범위별 키와 문자열을 넣습니다.
나중 등록이 앞선 등록을 덮어쓰며, 등록 해제나 소유자 종료 시 이전 값이
복원됩니다. 키와 이름 있는 자리표시자는 `@cms/sdk/i18n-manifest`를 따릅니다.
문자열은 최대 10,000자이며 마크업과 제어 문자를 허용하지 않습니다.

```ts
ctx.translations.register('ko', {
  site: { commentCount: '댓글 {count}개' },
});
```

`i18n.messages`는 `{ locale, scope, messages }`를 받아 재정의 문자열을
변경합니다. `locale`, `scope`는 변경할 수 없으며 등록과 같은 검증을 적용합니다.
`i18n.locale`는 `{ locale, scope, userId }`에서 지원 언어인 `en`, `ko` 중
하나를 선택합니다. 범위와 사용자 식별자는 변경할 수 없습니다.
잘못된 결과는 무시하고 직전 유효 값을 유지합니다.

`GET /api/v1/i18n/messages?locale=en&scope=site`는 재정의만 포함한
`{ locale, messages }`를 반환합니다. `scope=admin`은 로그인한 사용자가
조회할 수 있으며 익명 요청은 401입니다. `ETag`를 `If-None-Match`로
보내면 변경이 없는 응답은 304입니다. 등록 및 훅 변경은 공개 캐시를
무효화합니다. 번역은 HTML이 아닌 일반 텍스트로 렌더링해야 합니다.

이메일 템플릿은 발송 또는 큐 등록 전에 `i18n.locale`로 수신 언어를 결정하고
`email` 범위 재정의를 적용합니다. 시스템 메일은 수신자 ID를 전달하며
템플릿 인수와 비밀 링크는 번역 필터에 전달하지 않습니다. 작업 링크의 삭제,
복제, 제목 이동 또는 본문 줄 위치 변경은 해당 메일 전체를 선택한 언어의
코어 템플릿으로 되돌립니다. 이후 `email.system`에는 기존처럼 마스킹한
링크만 전달합니다.

## Settings

설정 훅의 타입은 `@cms/sdk/plugin`의 `SettingsSection`과
`PublicSettingsSection`으로 내보냅니다.

| 훅                       | 전달 값                                                                   | 현재 연결된 저장/조회 경로                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.beforeSave`    | `{ section, settings }`; 플러그인은 `{ section: 'plugin', id, settings }` | site, reading, writing, embeds, permalinks, membership, search, storage, discussion, seo, security, egress, email, sign-in, sso, plugin |
| `settings.updated`       | `settings.beforeSave`와 같은 구별 가능한 유니온                           | 위 저장 경로의 쓰기 완료 후                                                                                                             |
| `plugin.settingsUpdated` | `{ id: string, keys: string[] }`                                          | 플러그인 설정 쓰기 완료 후                                                                                                              |
| `site.public`            | `PublicSiteDto`                                                           | `SiteService.getPublic`                                                                                                                 |
| `settings.public`        | `{ section, settings }`                                                   | reading, embeds, seo, discussion                                                                                                        |

`section`과 플러그인 `id`는 변경할 수 없습니다. 반환 값은 해당 설정의
코어 스키마로 다시 검증하며, 잘못된 반환 값은 이전 값으로 대체합니다.
등록된 핸들러가 없으면 필터용 복사 및 검증을 실행하지 않습니다.
공통 저장 헬퍼는 비밀 값을 제거한 투영만 핸들러에 전달하고 원래 비밀 값을
복원하는 계약을 사용합니다.

자격 증명의 전송 대상은 `settings.beforeSave`에서 변경할 수 없습니다.
검색의 `host`(프로토콜·포트 포함), 메일의 전송 방식·플러그인 ID·SMTP
호스트/포트/보안/계정·HTTP 공급자/지역/도메인/URL/키 ID/인증 헤더,
저장소의 드라이버·S3 엔드포인트/버킷/지역/접두사/키 ID/주소 방식,
SSO의 공급자 ID/issuer/clientId/인증 방식, 캡차 공급자를 고정합니다.
코어 스키마로 정규화한 뒤 고정 필드를 비교하며, 변경한 핸들러의 결과
전체를 버리고 이전 값을 유지하며 경고를 기록합니다.
`settings.updated`의 자격 증명 설정 여부와 플러그인 전송 설정은
입력 기본값이 아니라 실제 커밋된 상태를 나타냅니다.
공개 토론 설정 필터는 조회 전에 실행되고, 이어서 `comment.publicQuery`가
최종 페이지 크기와 정렬을 정합니다. 응답과 댓글 링크도 같은 조회 설정을 사용합니다.

SEO는 `seo.beforeSave`, 토론은 `discussion.beforeSave` 다음에
`settings.beforeSave`를 실행합니다.
저장 후에는 `settings.updated`, 기존 섹션별 액션 순서로 알립니다.
공개 SEO는 `seo.public` 다음에 `settings.public`을 실행합니다.

검색 API 키, S3 및 플러그인 저장소 비밀 값, SMTP 비밀번호와 HTTP 메일
자격 증명, OIDC 클라이언트 비밀 값, 캡차 비밀 값은 필터와 액션에 전달하지
않습니다. 필터가 비밀 필드를 추가해도 저장에는 원래 제출/보관된 값을
사용합니다. 저장소와 SSO 액션은 트랜잭션 완료 후 실행됩니다.
공개 토론 설정에는 `requireLogin`, `fields`, `pageSize`, `threadDepth`만
포함되며 보류/차단 단어와 관리자 정책은 노출하지 않습니다.

## 콘텐츠

`content.excerpt`는 공개 요약을 만들 때
`{ excerpt, contentId, source: 'manual' | 'generated', length?, more? }`를
받습니다. 두 번째 읽기 전용 인자는 `{ length: 55, more: '…' }`입니다.
반환값의 `length`(0~1000 정수) 또는 `more`(최대 100자)를 바꾸면 생성 요약을
발행 본문에서 다시 생성합니다. 코어의 300자 요약 상한은 유지하며 수동 요약은
재생성하지 않습니다. ID·source 변경과 잘못된 결과는 무시합니다. 보호된 항목은
빈 요약을 유지하며 본문을 읽지 않습니다. 핸들러가 없으면 추가 조회가 없고
기본 생성 옵션을 유지할 때도 본문을 추가 조회하지 않습니다.
생성 옵션이 바뀐 항목의 본문은 한 번의 일괄 조회로 가져옵니다. 같은 조회에서
발행·휴지통·비밀번호·활성 유형 조건을 확인하므로 요약 조회 뒤 보호된 항목의
새 본문은 노출하지 않고 빈 요약으로 처리합니다.

`content.defaults`는 새 편집기의 `{ type, title, document }`를 필터링합니다.
`GET /api/v1/admin/content/defaults?type=post`는 콘텐츠 작성 권한을 확인하고
활성 유형의 기본값을 반환합니다. 유형은 변경할 수 없으며 문서는 저장 때와
동일한 코어 문서 렌더러·블록 검증을 통과해야 합니다. 웹의 새 항목 load가
이 DTO를 사용하고 실패한 폼·자동 저장·기존 항목의 텍스트가 기본값보다 우선합니다.
별도 컨텍스트 인자는 없으며 핸들러가 없으면 필터 검증을 생략합니다.

`content.publicQuery`는 검색이 아닌 공개 목록 조회의 정규화된
`PublicContentCriteria`를 필터링합니다. HTTP의 `orderby` 별칭은 먼저
`orderBy`로 바뀌며 반환값은 `publicContentCriteriaSchema`로 재검증합니다.
따라서 필터는 `orderBy: 'title' | 'updatedAt' | 'id' | 'publishedAt' | 'menuOrder'`와
`order: 'asc' | 'desc'`를 유지하거나 변경할 수 있습니다.
`content.publicResults`는 공개 목록의 `{ ids: string[], total: number }`를
필터링하며 순서 변경·삭제·추가를 허용합니다. 추가 ID는 공개 저장소에서 다시
조회하여 발행 상태와 활성 콘텐츠 유형을 확인합니다. 비밀번호 보호 항목의
본문은 목록에 노출하지 않습니다. 두 필터 모두 등록된 핸들러가 없으면
필터용 데이터 구성과 추가 조회를 생략합니다. 별도 컨텍스트 인자는 없습니다.

`content.html`은 `{ html, content: { id, type, slug, path, title }, context }`를
받습니다. `context`는 단건 `'single'`, 피드 `'feed'`, 미리보기 `'preview'`입니다.
본문만 변경할 수 있으며 변경된 HTML은 코어 HTML 가져오기와 동일한 문서
스키마로 파싱한 뒤 코어 렌더러로 다시 출력합니다. 임의 스크립트·이벤트 속성은
허용하지 않으며 스키마 밖의 마크업은 유지되지 않습니다. 그 다음 코어의 임베드
확장 정책을 적용하고 공개 단건에서는 `content.public`으로 전달합니다.
피드는 `resolvePath(path, undefined, 'feed')`로 피드 컨텍스트를 요청합니다.
핸들러가 없거나 HTML이 바뀌지 않으면 기존 코어 HTML을 재파싱하지 않습니다.
별도 컨텍스트 인자는 없습니다.

`content.beforeSave`의 두 번째 인자는 읽기 전용
`{ contentId: string | null, previous: ContentEntry | null, actorId: string }`입니다.
신규 저장은 ID와 이전 항목이 null이며 이전 항목에도 비밀번호 해시는 없습니다.
`content.updated`는 저장된 항목에 `previous: ContentEntry`를 추가합니다.
`content.statusChanged`는 생성·상태 변경·휴지통 이동·복원·예약 발행 뒤
`ContentEntry & { previousStatus }`를 전달합니다. 생성의 이전 상태는 null,
휴지통에서 복원할 때는 `'trash'`입니다. 휴지통 여부는 항목의 `trashedAt`으로
판단하며 저장된 `status`는 휴지통 이동으로 바뀌지 않습니다.

`content.trashAllowed`는 편집 권한 확인 뒤 boolean을 필터링합니다.
두 번째 인자는 `{ content: ContentEntry, actorId }`이며 후속 핸들러가
앞선 false를 true로 뒤집을 수 있습니다.
`content.slug`는 `{ slug, title, type, contentId }`에서 slug를 변경하며
코어 입력 규칙으로 정규화하고 예약어·중복 여부를 검사합니다.
`content.revisionsToKeep`는 `{ count, type }`를 받으며 정수 0~25만 허용합니다.
0은 저장 이력을 남기지 않습니다.

`content.title`은 공개 단건·목록의 `{ title, contentId }`를 필터링합니다.
ID는 바꿀 수 없으며 제목은 공개 DTO 제목 스키마로 검증합니다.
`contentType.definition`은 내장·등록·관리자 정의 유형의 최종 정의를
필터링합니다. 코어 정의 스키마로 재검증하고 `key`와 `builtin` 변경은
거부합니다. 두 필터는 별도 컨텍스트가 없으며 핸들러가 없으면 건너뜁니다.

| 확장             | API                                          | 설명                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 콘텐츠 액션      | `hooks.on(name, handler)`                    | `content.scheduled`(예약 생성·변경), `content.revisionRestored`(복원 저장 후): 관리자 콘텐츠 DTO. `term.created/updated/deleted`: 저장 확정 뒤 관리자 용어 DTO                                                     |
| 콘텐츠 정의 액션 | `hooks.on(name, handler)`                    | `contentType.created/updated/deleted`, `field.created/updated/deleted`: 저장 확정 뒤 정의 DTO. `permalinks.updated`: 경로 재생성 성공 뒤 설정 DTO                                                                  |
| 콘텐츠 정의 필터 | `hooks.filter(name, handler)`                | `contentType.beforeSave`, `field.beforeSave`: 검증된 입력을 받고 결과를 동일 스키마로 재검증. 수정 시 기존 key 유지                                                                                                |
| 용어 필터        | `hooks.filter(name, handler)`                | `term.beforeSave`(검증된 입력, 결과 재검증), `term.query`(목록 인자), `term.public`(공개 DTO), `term.deleteAllowed`(삭제 허용). 잘못된 결과는 무시                                                                 |
| 콘텐츠 조회 필터 | `hooks.filter('content.query', handler)`     | 권한 확인 뒤 관리자 목록 조회 인자. 결과를 동일 스키마로 다시 검증                                                                                                                                                 |
| 콘텐츠 변경 액션 | `hooks.on(name, handler)`                    | `content.termsChanged`: 콘텐츠 저장 시 할당 ID 집합이 바뀐 경우 관리자 DTO. `content.revisionSaved`: 리비전이 저장된 콘텐츠 DTO. `content.autosaved`: `{ contentId, revision }` 관리자 리비전 DTO                  |
| 콘텐츠 주소 필터 | `hooks.filter('content.permalink', handler)` | 공개 단건·목록의 `{ contentId, path }`. 해당 콘텐츠가 소유한 현재·별칭 경로만 허용. 잘못된 결과는 경고 후 무시. 새 경로는 고유주소 토큰으로 생성                                                                   |
| 콘텐츠 거부 필터 | `hooks.filter(name, handler)`                | `content.publishAllowed`, `content.deleteAllowed`: boolean, 코어 판단은 초기값일 뿐이며 모든 핸들러가 true 또는 false를 반환할 수 있음. 앞선 거부도 허용으로 뒤집을 수 있음. 예약 발행과 휴지통 자동 정리에도 적용 |

분류 용어를 삭제하면 `term.deleted`를 발행한 뒤, 영향을 받은 남은 항목마다 `content.termsChanged`를 발행합니다(관리자 DTO는 커밋 뒤에 읽음). 예약 발행과 휴지통 자동 정리는 영향을 받은 항목마다 수명주기 액션을 발행합니다.

`term.query`(WordPress `get_terms_args`)는 관리자·공개 용어 목록의
`{ taxonomy, parentId?, search?, hideEmpty?, orderBy?, order? }`를 필터링합니다.
초기값은 URL 분류의 `{ taxonomy }`이고 두 번째 인자는 읽기 전용 `{ scope: 'admin' | 'public' }`입니다.
`parentId`는 그 용어의 직계 자식만, `null`은 최상위 용어만 남깁니다. `search`는 이름·슬러그의
부분 일치이며(저장소의 문자열 비교 규칙, `%`·`_`는 글자 그대로) `hideEmpty`는 목록 범위의
개수(관리자: 모든 상태, 공개: 발행 항목)가 0인 용어를 뺍니다. `orderBy`는 `name`(기본)·`slug`·
`count`·`createdAt`, `order`는 `asc`(기본)·`desc`이며 같은 값은 이름·ID 순입니다.
결과는 `termQuerySchema`로 재검증하고, 다른 분류로 바꾸려면 그 분류가 존재해야 합니다.
잘못된 결과는 무시하며 핸들러가 없으면 검증 없이 기본 목록을 조회합니다.

`term.deleteAllowed`(WordPress `pre_delete_term`)는 `taxonomy.manage` 권한 확인을 통과한
용어 삭제 직전의 boolean을 필터링합니다. 코어 초기값은 `true`이며 두 번째 인자는 읽기 전용
`{ term: AdminTaxonomyTerm }`입니다. 모든 핸들러가 `true`·`false`를 반환할 수 있고, 최종값이
`false`이면 `403 forbidden`으로 거부하며 아무것도 바꾸지 않습니다. 필터는 권한 검사를 대신하지 않습니다.

용어 필드(WordPress term meta)는 필드 정의의 `taxonomies`(분류 키 배열, 기본 `[]`)로 지정합니다.
`contentTypes`도 기본값이 `[]`이며 `contentTypes`·`taxonomies`·`comments`([댓글 필드](#댓글)) 중 하나 이상이 필요합니다. 플러그인은
`fields.register(key, { label, type, taxonomies: ['category'] })`로, 관리자는 같은 정의 API로
용어 필드를 만듭니다. 값은 `taxonomy_terms.fields`(JSON)에 저장되고 용어와 함께 삭제됩니다.
용어 입력의 `fields`는 `term.beforeSave` 이후 해당 분류의 정의로 검증합니다. 선언되지 않은 키는
버리고 유형·필수 여부를 검사하며 오류 경로는 `fields.<key>`입니다. 수정 시 `fields`를 생략하면
기존 값을 그대로 유지합니다. 비활성·해제된 플러그인의 `plugin:` 필드 값은 다른 값을 저장해도
보존되며 공개 출력에서만 빠집니다. 관리자 용어 DTO의 `fields`는 저장된 값 전체이고, 공개 용어
DTO의 `fields`는 `public` 필드만 담습니다(이미지 필드는 `PublicImage`, 없는 이미지는 생략).
공개 목록은 정의와 이미지를 한 번씩만 읽고, 값이 하나도 없으면 추가 조회를 하지 않습니다.
필수 용어 필드가 있으면 그 값을 보내지 않는 용어 생성은 `invalid_input`으로 거부됩니다.
관리자 분류 화면은 콘텐츠 편집기와 같은 필드 입력(`CustomFields.svelte`)과 서버 폼 해석을 사용하며,
분류에 용어 필드가 없으면 `fields`를 보내지 않습니다. 이미지 필드가 가리키는 파일은 `term_media`에
기록되어 콘텐츠와 같이 미디어 사용 수·삭제 보호·미첨부 필터·"사용 위치"(`kind: 'term'`)에 포함되며,
`fields`를 보낼 때마다 다시 만들고 용어와 함께 삭제됩니다.

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

미디어 URL은 공통 비동기 projection을 거칩니다. 저장소의 원본 URL은 DB에 유지하고
관리자 DTO, 공개 이미지, 콘텐츠 대표 이미지, 본문 이미지의 src/srcset을 만들 때
`media.url`을 적용하므로 CDN 주소를 바꾸어도 기존 파일을 다시 저장할 필요가 없습니다.

미디어·토론 추가 훅: `media.updated`(메타데이터 커밋 뒤 AdminMedia), `discussion.updated`(설정 저장 뒤 DiscussionSettings); `media.beforeSave`(메타데이터 입력 재검증), `discussion.beforeSave`(설정 입력 재검증). 기존 `media.uploaded/deleted` 액션도 유지됩니다.

미디어 필터의 잘못된 반환값은 무시하며 이전에 검증된 값을 유지합니다. 신뢰하는 함수도
필터 값만 호출 전에 복사하여 제자리 변경 뒤 거부·예외가 발생하면 복구합니다.
컨텍스트 인수(업로드 바이트 포함)는 이 복구용 복사에 포함하지 않습니다.
URL과 저장 키는 최종 사용 시에도 다시 검증합니다.

- `media.filename`: 경로·제어 문자가 없는 1~255자 표시 이름입니다. 저장 키는 바꾸지 않습니다.
- `media.storageKey`: `{ key, directory, basename, extension }`과 읽기 전용 컨텍스트 `{ id, mime, bytes, size, uploadedAt, filename }`을 받습니다. uploadedAt은 ISO 문자열입니다. key를 유지하면 directory/basename을 조합하고, key 자체를 바꾸면 그 경로를 사용합니다. 확장자는 sniff한 MIME의 코어 확장자와 같아야 합니다. 상대 경로만 허용하며 각 세그먼트는 영숫자로 시작하고 `[A-Za-z0-9._-]`만 허용합니다. `..`, 역슬래시, 제어 문자, 절대 경로를 거부하고 전체 255자·세그먼트 128자와 파생 이미지/충돌 접미사 공간을 검사합니다. 잘못된 결과는 경고 후 이전 키(초기값은 코어 키)를 유지합니다. 기존 키 또는 저장소 파일과 충돌하면 `-1`, `-2` 순서로 시도하며 최대 10000번으로 제한합니다. 파생 키는 `<base>-<size>.webp`입니다. 로컬·플러그인 저장소 모두 선택된 키를 받습니다. `media_storage_keys`의 바이너리 기본 키로 원본·실제로 생성한 파생 파일만 한 번에 예약합니다. 고유 제약이 여러 API 인스턴스의 충돌을 원자적으로 거부하며 미디어 삽입과 예약 소유권 연결은 같은 트랜잭션입니다. 파일 조회는 이 인덱스를 사용하며 전체 variants JSON을 검색하지 않습니다. 삭제 시 연결만 해제하고 실패·삭제 예약은 계속 유지하여 지연된 쓰기/정리가 재사용된 키의 새 파일을 손상시키지 못하게 합니다. `20261122000000_media_storage_keys`는 스키마만 만들고, 부팅 및 주기적인 leased catch-up이 원본·파생 키를 media 100행 단위로 이관합니다. 매 순회의 최대 ID 상한을 시작 시 고정하므로 큰 ID가 계속 삽입되어도 순회가 종료되고, 커서 뒤에 삽입된 행도 다음 순회에 처리됩니다. 원본 고유 인덱스/구버전 UUID 파생 파일의 PK 조회는 miss 시 한 행만 보완합니다. 기존 파일·URL은 변경하지 않습니다. 배포 순서와 중단 복구는 [운영 문서](../operations.md#미디어-키-인덱스의-다중-인스턴스-배포)를 참고하세요.
- `media.url`: `{ url, key, variant, driver }`에서 url만 바꿀 수 있습니다. variant는 원본이면 null, 파생 이미지면 크기 이름입니다. HTTP(S) 절대 주소 또는 `/`로 시작하는 동일 출처 경로만 허용합니다. `//`, 역슬래시, 공백·제어 문자, 사용자 정보가 있는 주소를 거부합니다. 잘못된 결과는 이전 URL을 유지합니다. 핸들러가 없으면 훅 dispatch와 URL 변환을 생략합니다.
- `media.uploadAllowed`: `{ allowed, filename, mime, size }`에서 `allowed`만 변경합니다. 허용과 거부 모두 가능하며 뒤의 필터가 앞의 결정을 바꿀 수 있습니다.
- `media.filename`과 `media.uploadAllowed`의 두 번째 인수는 읽기 전용 `{ bytes, mime, size, originalName }`입니다. 신뢰하는 사이트·테마 함수에는 원본 바이트를 복사 없이 전달하므로 변경하면 안 됩니다. 플러그인은 격리된 복사본만 받습니다.
- `media.allowedTypes`: 허용할 MIME 문자열 배열입니다. 코어가 식별할 수 있는 타입만 허용하며 중복을 거부합니다. SVG의 초기 포함 여부는 설정을 따르지만 필터가 다시 허용할 수 있습니다. SVG 정화, 바이트 식별, 업로드 크기 제한은 우회하지 못합니다.
- `media.imageSizes`: `{ mime, width, height, sizes, quality? }`입니다. MIME·원본 치수는 고정이고 등록된 크기 이름의 부분집합만 허용합니다. 최대 32개, 이름 중복 금지, 치수는 1~8192 정수, WebP 품질은 선택적인 1~100 정수입니다. 업로드 파생 이미지 생성에 적용합니다.
- `media.beforeInsert`: `{ filename, alt, caption, title?, description? }`를 삽입 전에 변경합니다. 파일 이름은 안전한 표시 이름 규칙을 따르고 alt/caption은 각 2000자, title은 255자, description은 10000자 이하입니다. 추가 필드는 거부합니다.
- `media.deleteAllowed`: boolean과 두 번째 인수 `{ media: AdminMedia }`를 받습니다. 초기값은 사용 중 여부와 force로 정하며 필터는 양방향으로 변경할 수 있습니다. 사용자 권한 검사는 우회하지 못합니다.

`imageSizes.register({ name, width, height?, crop? })`는 이미지 크기를 등록합니다. 코어 크기는 플러그인 API가 아니라 등록소 자체에서 선언되며 충돌 시 우선합니다. 코어 크기 이름에 대한 플러그인 등록은 경고와 함께 거부되므로 플러그인은 없는 이름만 추가할 수 있습니다. 같은 이름을 여러 플러그인이 등록하면 마지막 등록이 우선하고, 등록을 해제하면 이전 등록이 복원됩니다. 업로드 시 활성 크기가 생성되며, 플러그인을 비활성화하면 이후 생성만 멈추고 기존 파생 이미지는 삭제하지 않습니다. `POST /api/v1/admin/media/:id/derivative?name=…`(인증 필요)는 저장하지 않고 캐시할 수 없는 WebP를 반환합니다. 웹의 미디어 선택기와 에디터 이미지 크기 선택은 플러그인 크기를 포함해 미디어 DTO의 `variants`를 나열합니다(연동 완료).

## 댓글

모더레이터는 `commentCheckers`를 건너뛰지만 `comment.beforeSave`는 여전히 실행됩니다. 메일 한 통의 `comment.notification.to`는 고정되며, 필터는 subject/text만 바꿀 수 있습니다. 수신자가 바뀌면 필터 결과는 무효가 됩니다. 누구에게 보낼지는 아래 `comment.notificationRecipients`가 정합니다.

아래 세 필터는 등록된 핸들러가 없으면 필터 값 구성·검증·추가 조회를 모두 생략합니다(`hooks.has` 확인). 잘못된 결과는 경고 후 무시하고 이전 값을 유지합니다.

`comment.openAllowed`(WordPress `comments_open`)는 `{ contentId, type, allowed }`를 필터링합니다. `type`은 글의 콘텐츠 유형 키이며 `contentId`와 함께 바꿀 수 없습니다. 초기값은 코어 판단(토론 켜짐, 유형이 댓글 지원, 글이 댓글 허용, `closeAfterDays` 기간)이고, 모든 핸들러가 `true`·`false`를 반환할 수 있어 코어가 닫은 글을 열거나 열린 글을 닫을 수 있습니다. 결과는 댓글 작성(`false`이면 `403 forbidden`)과 공개 댓글 상태 `GET /api/v1/comments`의 `open`에 함께 쓰이므로 웹의 댓글 폼·캡차 표시도 따릅니다. 게시·보호(잠금 해제 증명)·`requireLogin`·속도 제한·캡차·`comment.submitAllowed` 검사는 우회하지 못합니다. WordPress의 `pings_open`에 해당하는 핑백·트랙백은 이 CMS에 없습니다.

`comment.publicQuery`(WordPress `comments_template_query_args`)는 공개 스레드 조회 `{ contentId, page, pageSize, order }`를 필터링합니다. 초기값은 요청 페이지(1~`PAGINATION_MAX_PAGE`), 토론 설정의 `pageSize`, `order: 'asc'`(오래된 순)입니다. 결과는 `contentId`·`page` 고정(바꾸면 결과 전체가 무효), 1페이지 결과의 `pageSize`·`order`가 글 전체에 적용되며 2페이지 이후 필터는 그 값에서 시작하고 바꾼 결과는 무효, `pageSize` 1~200 정수, `order` `'asc' | 'desc'`로 다시 검증합니다. `order`는 최상위 댓글의 작성 시각(같으면 ID) 순서이며 답글은 항상 부모 아래 오래된 순입니다. 응답의 `page`·`pageSize`는 필터 결과를 따르므로 웹의 페이지 수 계산도 일치합니다. 새 댓글 작성 응답의 `page`와 최근 댓글 위젯 링크의 `cpage`는 같은 필터를 `page: 1`로 실행해 얻은 `pageSize`·`order`로 계산합니다(반환된 `page`는 무시). 공개·승인 조건과 잠금 해제 확인은 필터와 무관하게 유지됩니다.

`comment.notificationRecipients`(WordPress `comment_notification_recipients`, `comment_moderation_recipients`)는 `{ commentId, kind, to: string[] }`를 필터링합니다. `kind`는 `'pending'`(검토 대기 댓글, 모더레이터 메일), `'approved'`(승인된 댓글, 글 작성자 메일), `'reply'`(승인된 답글, 부모 댓글 작성자 메일)이며 `commentId`와 함께 바꿀 수 없습니다. 초기값 `to`는 코어 수신자입니다: `pending`은 `notifyModerators`가 켜졌을 때 `comments.moderate` 권한이 있는 사용자, `approved`는 `notifyAuthors`가 켜졌을 때 글 작성자(댓글 작성자 본인이나 이미 답글 메일을 받는 경우 제외), `reply`는 `notifyCommenters`가 켜졌을 때 부모 댓글 작성자(수신 거부 시 제외)입니다. 설정이 꺼져 있으면 초기값은 `[]`이고 핸들러가 수신자를 추가할 수 있습니다. 메일 전송이 꺼져 있으면(승인·답글은 사이트 주소가 없을 때도) 실행되지 않습니다. 핸들러는 초기 주소를 제거할 수 있고, 기존 사용자 계정의 이메일 주소(대소문자 무시)만 추가할 수 있습니다. 그 밖의 주소가 하나라도 있으면 결과 전체가 무효입니다. 답글 메일 수신을 거부한 부모 댓글 작성자의 주소는 어떤 `kind`에서도 다시 추가할 수 없습니다. 추가된 사용자의 메일(대기 댓글 포함)은 사용자 ID를 담은 작업으로 대기열에 넣고, 발송 직전에 계정 존재·주소 유지·부모 작성자 수신 거부 여부와 댓글 상태(대기 메일은 여전히 검토 대기)를 다시 확인해 맞지 않으면 보내지 않습니다. 결과는 최대 100개(코어 수신자가 더 많으면 그 수)이며 중복 주소는 한 번만 보냅니다. 추가된 사용자는 대기 댓글이면 같은 검토 대기 메일을 받지만, 발송 시점에 `comments.moderate` 권한이 없으면 댓글 작성자의 이메일 주소가 빠진 본문을 받습니다(작업에는 주소를 저장하지 않음). 승인·답글이면 글 작성자와 같은 "새 댓글" 메일을 받고(요약 링크는 글 주소), 발송 직전에 그 계정이 같은 주소를 유지하는지 다시 확인합니다. 추가된 수신자도 메일 폭주 요약과 `comment.notification`(subject/text)을 똑같이 거칩니다. 브라우저 푸시 수신자는 바꾸지 않습니다.

댓글 필드(WordPress `comment_form_default_fields`와 comment meta)는 필드 정의의 `comments: true`로 지정합니다(기본 `false`). 플러그인은 `fields.register(key, { label, type, comments: true })`로, 관리자는 필드 화면의 "댓글" 확인란이나 같은 정의 API로 만듭니다. 방문자가 미디어를 고를 수 없으므로 `image` 유형은 댓글 필드로 지정할 수 없습니다(`FieldCommentImage`). 공개 댓글 조회·작성은 저장된 필드 정의를 프로세스 공개 캐시(최대 5초, 설정 쓰기 시 즉시 무효화)에서 읽고 플러그인 정의는 항상 현재 값을 씁니다. 값은 `comments.fields`(JSON, 마이그레이션 `20261124000000_comment_fields`)에 댓글과 함께 저장되고 댓글과 함께 삭제됩니다. 작성 입력의 `fields`(최대 100개 키)는 허니팟 다음에 현재 댓글 필드 정의로 검증합니다. 선언되지 않은 키는 비활성 플러그인의 `plugin:` 키까지 모두 버리고, 유형·필수 여부를 검사하며 오류 경로는 `fields.<key>`입니다. 모더레이터의 관리자 답글은 필드 값이 없습니다. 저장된 값은 이후 정의가 바뀌거나 등록이 해제되어도 다시 쓰지 않으므로 보존됩니다. 관리자 댓글 DTO와 `PluginComment`의 `fields`는 저장된 값 전체이고, 공개 댓글 DTO의 `fields`는 현재 정의된 `public` 필드만 담습니다. 공개 댓글 상태의 `customFields`는 폼에 표시할 `{ key, label, type, options, required, help }` 목록이며 저장된 값은 담지 않습니다. 개인정보 내보내기는 댓글의 `fields`를 포함하고 삭제(익명화)는 비웁니다. 웹 댓글 폼은 신원 필드 다음에 이 필드를 `field.<key>` 입력으로 표시하고(라벨·도움말·선택지는 일반 텍스트로 이스케이프), 폼이 필드를 표시했을 때만 서버 액션이 공개 댓글 상태의 정의로 값을 유형별로 읽어 보냅니다. 검증은 항상 API가 다시 합니다.

`PluginComment`(댓글 액션), `CommentCheck.comment`, `comment.beforeSave` 초안에는 `authorEmail`처럼 비공개 `authorIp`와 `authorUserAgent`(증명되지 않으면 null)가 들어 있으며, 스팸 방지 검사와 스팸/정상 신고에 사용합니다. 이 값은 `comment.public`에 나타나지 않으며, 플러그인도 공개로 노출하면 안 됩니다([댓글](../features/comments.md#작성자-ip-주소와-사용자-에이전트)). WXR `import.item`/`export.data` 댓글은 선택 항목인 `authorIp`/`authorUserAgent`를 받습니다.

`commentCheckers.register({ check(input) })`는 `{ status: 'approve' | 'hold' | 'spam', reasons: string[] }`을 반환합니다. 코어 토론 정책도 같은 등록소에 컴포지션 루트 전용 `registerCore`로 등록되며 가장 엄격한 판정을 합칩니다. 코어 검사기는 격리 없이 직접 실행되고 예외·잘못된 반환값은 그대로 전달되어 댓글 제출이 실패합니다(승인으로 바뀌지 않음). 플러그인 실패·시간 초과·잘못된 반환값은 무시하고 비활성화 때 등록을 해제합니다. 기존 `comment.beforeSave`는 이 판정 뒤에 그대로 실행됩니다.

| 댓글 확장 | 계약                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 액션      | `comment.updated`, `comment.deleted`: 커밋된 댓글; 삭제는 단건·일괄·자동 정리 포함. 답글은 기존 `comment.created`의 `parentId`로 식별. 상태 변경은 기존 `comment.statusChanged`를 항목별 발행.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 필터      | `comment.query`: 관리자 목록 조건, `comment.public`: 공개 댓글 DTO, `comment.notification`: 발송 전 to/subject/text(작성자·답글·요약 메일 공통), `comment.push`: 큐에 넣기 전 브라우저 푸시 `{ title, body, url, tag, icon? }`(title/body만 변경 가능, url·tag·icon은 코어 고정), `comment.submitAllowed`: 코어 검사 이후 contentId/authorName/authorEmail/address와 양방향 allowed, `comment.openAllowed`: 댓글 허용 여부(양방향), `comment.publicQuery`: 공개 스레드 page/pageSize/order, `comment.notificationRecipients`: 알림 메일 수신자(제거 또는 기존 사용자 주소만 추가).                                                                                       |
| 저장소    | `context.storageDrivers.register(key, { label, fields, connect(settings) })`는 `plugin:<owner>:<key>`를 등록합니다. `PluginStorageDriver`, `MediaStorageDriver`, `StorageDriverRegistrar`는 `@cms/sdk/plugin`에서 내보냅니다. 반환된 어댑터는 `commit`, 범위 지정 `read`, 멱등한 `remove`를 구현합니다. 코어 등록은 노출되지 않으며, 범위(scope)를 해제하면 가져간 어댑터는 대체 없이 회수됩니다. 설정 필드는 메일 전송 유형을 따르고, 비밀 값은 봉인되어 DTO 값에서 제외됩니다. 제공자 설정이 바뀐 뒤에도 기존 키는 계속 읽을 수 있어야 합니다. 로컬/S3 인벤토리 재동기화는 코어 전용이며, 플러그인 어댑터는 현재 전달과 정리만 제공하고 목록 열거는 제공하지 않습니다. |

토론 설정 훅(`discussion.updated`, `discussion.beforeSave`)은 미디어 절의 “미디어·토론 추가 훅”에 함께 있습니다.

## 사용자

역할 지정의 기본 목록은 행위자가 가진 권한의 부분집합 역할로 제한됩니다.
관리자는 모든 역할을 지정할 수 있고 비관리자는 `administrator`를 지정할 수
없습니다. `role.assignable` 핸들러는 이 기본 목록을 줄이거나 등록된 다른
비관리자 역할을 명시적으로 허용할 수 있습니다. 코어의 행위자 권한 상한은
필터의 초기값이며 반환값의 상한이 아닙니다. 핸들러는 기본 목록 밖의 기존
역할을 허용할 수 있고 이는 서버 코드의 명시적 정책 결정입니다. 존재하지
않는 역할·중복 키·행위자 변경은 거부합니다. 역할 삭제 후 재지정·생성/초대·가져오기에도
같은 정책을 적용합니다.

역할 정의의 생성·권한 수정은 역할 **지정** 필터와 별개입니다. 비관리자는
자신이 가진 권한만 다른 역할에 저장할 수 있고, 자신이 현재 사용하는 역할에
새 권한을 추가할 수 없습니다. 일시적으로 부여받은 권한도 자신의 역할에
추가할 수 없으며 관리자 역할은 수정할 수 없습니다. 관리자는 사용자 지정
역할의 권한 상한 제한을 받지 않습니다. 새 역할 생성에도 같은 저장 검증을
적용하고, 사용자 가져오기는 이 검증을 우회해 역할 정의를 생성하거나 변경하지 않습니다.

`avatar.url`은 `{ emailHash, size, url }`을 받습니다. 정규화된 이메일의 MD5와
크기는 고정되며 반환 URL은 HTTP(S)만 허용합니다. 원문 이메일·인증 토큰은
전달하지 않습니다. 기본 URL은 공개 아바타 프록시이며 변경하지 않으면 기존
상대 경로를 유지합니다. 핸들러가 없으면 이메일 조회·해시·사이트 URL 조회를
생략합니다. 외부 제공자를 선택하면 브라우저가 그 URL을 직접 요청합니다.

`role.assignable`은 `{ actorId, roles: string[] }`로 현재 등록된 역할 키 목록을
전달합니다. 반환값은 중복 없는 기존 역할의 부분집합이어야 하고 행위자는 고정됩니다.
관리 화면의 역할 지정 옵션과 `UserService.setRole`에 같은 정책을 적용합니다.
사용자 생성/수정으로 역할 제한을 우회할 수도 없습니다. 역할 관리 목록과
기존 권한 해석은 필터하지 않으며 핸들러가 없으면 검증·필터 호출을 생략합니다.

`capability.check`는 객체 가드에서 `{ userId, role, capability, object, allowed }`를
전달합니다. `object`는 `{ kind: 'content' | 'media' | 'comment' | 'user' | 'term',
id, ownerId?, status? }`이며 식별 문맥은 고정입니다. 핸들러는 코어 권한 판단을
양방향으로 바꿀 수 있지만 비밀번호·토큰·본문은 받지 않습니다. 콘텐츠 편집과
비공개 읽기(미리보기·리비전 포함), 미디어 상세/문맥 읽기와 편집/삭제, 댓글
수정/일괄 조정/삭제, 사용자 역할 변경/수정/삭제, 분류 편집/삭제에 적용됩니다.
핸들러가 없으면 문맥 생성·검증과
댓글 추가 조회를 생략합니다. 일괄 댓글은 모든 객체의 허용을 확인한 뒤 쓰며,
마지막 관리자 보호·자기 삭제 금지·게시 상태 전환 규칙은 유지됩니다.

신원 없는 회원가입 정책 조회는 핸들러가 없으면 캐시·훅을 모두 생략합니다.
핸들러가 있으면 5초짜리 공개 캐시에 진행 중인 Promise까지 공유하여 익명
동시 요청이 훅 실행을 증폭하지 않게 합니다. 수명은 완료 시점부터 시작하며
진행 중인 채우기는 수명 때문에 중복 실행되지 않습니다. 설정/회원가입 변경과 훅 등록·해제
(functions/플러그인 재로딩 포함)는 진행 중인 결과까지 무효화합니다.
실제 등록 요청은 캐시를 쓰지 않고 기존 속도 제한 후 신원 문맥으로 검증합니다.

비밀번호 재설정 API와 로그인 설정 단계의 비밀번호 저장은 같은 최종 처리기를
사용합니다. `user.passwordResetAllowed`가 거부하면 증명을 소비하지 않으며,
성공한 단일 커밋만 `user.passwordReset`을 발행합니다.

`user.registrationAllowed`는 `{ allowed, email, name }`을 받습니다. 등록 요청은
속도 제한 통과 후 정규화된 이메일·이름을 전달하며 두 값은 변경할 수 없습니다.
`GET /api/v1/auth/register`는 신원 없는 `{ email: null, name: null }`로 같은 필터를
실행해 `registrationOpen`을 반환합니다. 웹 가입 폼과 로그인 화면의 가입 링크는
이 유효 상태를 사용합니다. `enabled`는 원래 회원가입 설정이며 필터는 양방향입니다.
핸들러가 없으면 필터 호출과 검증을 생략합니다.

비밀번호 훅은 비밀번호·해시·토큰 없이 `{ user: UserProfile }`만 전달합니다.
`user.passwordResetRequested`는 백그라운드 재설정 요청 또는 관리자 요청의
사용자 확인 뒤, `user.passwordReset`은 재설정 커밋 뒤,
`user.passwordChanged`는 현재 비밀번호 확인 후 변경 커밋 뒤 실행됩니다.
`user.passwordResetAllowed`는 `{ user, allowed }`를 받으며 양방향 허용/거부가
가능합니다. 사용자 정보 변경은 거부합니다. 일반 요청은 비밀번호 로그인 설정을
초기값으로 쓰고 관리자 메일 요청은 기존처럼 허용에서 시작합니다. 필터는 실제
재설정 시에도 적용됩니다. 공개 요청의 계정 존재 여부는 백그라운드 처리로 숨깁니다.

`user.loginRedirect` 필터는 최종 로그인 성공 뒤 `{ user, method, redirectTo }`를
받습니다. 사용자·방식은 고정이며 초기 경로는 `/admin`입니다.
반환 경로는 `/`로 시작하는 같은 출처 경로만 허용하고 외부 URL·`//`·역슬래시·
공백·제어 문자는 거부합니다. 웹은 콜백과 일반 로그인 모두 이 경로를 따르되
인증 페이지 순환을 차단합니다. 핸들러가 없으면 기존 `redirect_to`를 유지합니다.
세션 토큰은 훅에 전달하지 않습니다.

`user.sessionLifetime` 필터는 세션 발급 시 `{ user: UserProfile, ttlMs: number }`를
받습니다. 사용자 정보는 고정되며 수명은 양의 정수 밀리초, 최대 365일입니다.
유효하지 않은 반환값은 무시합니다. 승인된 수명은 저장된 만료 시각과 로그인
응답에 동일하게 반영됩니다. 토큰은 전달하지 않으며 핸들러가 없으면 생략합니다.

`user.sessionAllowed` 필터는 유효한 세션 또는 API 토큰 인증 후
`{ user: UserProfile, kind: 'session' | 'apiToken', allowed: boolean }`을 받습니다.
초기값은 `true`이며 뒤의 핸들러가 이전 거부를 허용으로 바꿀 수 있습니다.
사용자와 인증 종류는 변경할 수 없고 토큰은 전달하지 않습니다.
핸들러가 없으면 검증과 필터 호출을 모두 생략합니다.

`user.signedOut` 액션은 세션 삭제가 완료된 후 `{ user, scope, actorId }`를
전달합니다. `user`는 비밀 값이 없는 `UserProfile`이며 `scope`는 현재 세션
로그아웃의 `session`, 지정 세션 철회의 `other`, 전체 세션 철회의 `all`입니다.
토큰과 토큰 해시는 전달하지 않으며 핸들러가 없으면 추가 사용자 조회를 하지 않습니다.

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
| 사용자 필터      | `hooks.filter(name, handler)`             | `user.beforeSave`(create/update/profile/role; 비밀번호 제외, 작업·대상 고정), `user.query`(관리 목록 role/search), `user.public`(공개 저자 DTO), `user.registrationAllowed`(허용/거부), `user.capabilities`(아래 권한 정책). 잘못된 반환값은 무시 |
| 개인정보 훅      | `hooks.on` / `hooks.filter`               | `privacy.requested/exported/erased`는 커밋된 요청 DTO(토큰 제외). `privacy.exportData`는 확인된 요청의 `data`에 플러그인 개인정보를 추가하며 코어 스트림을 대체하지 않음(직렬화 가능한 JSON, 최대 1 MiB). 요청 식별자는 고정                      |
| 차단 액션        | `hooks.on('protection.blocked', handler)` | 작업·차단 사유와 계정/주소의 도메인 분리 HMAC만 전달. 원문 계정·IP·캡차 토큰·비밀은 제외                                                                                                                                                          |

`user.capabilities`는 신뢰하는 서버 플러그인에 한해 WordPress `user_has_cap`처럼 권한 추가·제거를 허용합니다. 인증이 확인된 사용자만 평가하며 익명은 훅을 실행하지 않고 권한이 없습니다. 선언된 capability 카탈로그에 없는 권한과 사용자/역할 식별자 변경은 거부합니다. 역할 자체의 권한을 넘는 추가는 `(plugin, user, capability)`별 프로세스 수명 동안 한 번 `warn`으로 기록합니다(정책 거부 전용 필터와는 별도). 선언된 capability 카탈로그는 아래 capability 등록소입니다. `RoleService.capabilities(role, userId)`에 인증된 id를 전달해야 필터가 적용됩니다.

`user.beforeSave`는 자격 증명이 없는 create/update/profile/role 입력을 필터링하며, 작업과 대상 식별자는 고정됩니다. `user.query`는 관리자 role/search 조건을 필터링합니다. `user.capabilities`는 인증이 확인된 사용자에 한해서만 권한 추가와 제거를 허용합니다. 알 수 없는 권한은 거부되고, 역할 권한을 넘는 추가는 (플러그인, 사용자, 권한)별로 프로세스당 한 번 `warn` 수준으로 기록됩니다. `privacy.requested/exported/erased`는 커밋된 토큰 없는 요청 DTO를 발행하고, `privacy.exportData`는 코어 섹션을 대체하지 않고 크기가 제한된 JSON 확장을 추가합니다. `protection.blocked`는 작업, 사유, 도메인 분리된 계정/주소 HMAC을 노출하며 원문 식별자는 노출하지 않습니다.

권한(capability) 등록소: `capabilities.register({ key, label })`는 권한을 선언하며 비활성화하면 회수됩니다. 코어 권한도 같은 등록소를 사용하며 가려질 수 없습니다. 관리자는 등록된 권한을 사용자 지정 역할에 부여할 수 있습니다. 선언되지 않은 권한은 거부되고, 등록이 제거되면 더 이상 권한이 부여되지 않습니다. `GET /api/v1/admin/capabilities`가 이 목록을 반환합니다([라우트](../api/routes.md) 참고). 웹의 역할 편집기는 이 목록으로 권한 이름을 표시하고, 플러그인 권한을 출처별로 묶으며, 플러그인이 기여한 역할을 표시합니다(연동 완료).

## 외관

### 본문 렌더링

`block.html`은 플러그인 블록 렌더링 결과 `{ name, attrs, html }`을
필터링합니다. 두 번째 인자는 `{ content: { id, type, slug } | null }`입니다.
블록의 원래 출력과 필터 결과를 각각 공용 문서 파서와 렌더러로 정제하며, 동일 블록과 속성의 결과는
요청 안에서만 공유합니다. 핸들러가 없으면 필터 작업을 생략합니다.

`embed.html`은 선택된 제공자의 `{ url, provider, html }`을 필터링합니다.
`url`과 `provider`는 변경할 수 없습니다. 일반 HTML에는 공용 문서 정책을,
iframe에는 제공자가 반환한 HTTPS `src` 허용 목록과 임베드 권한 허용 목록을
적용합니다. 다른 출처, `srcdoc`, 이벤트 속성, 스크립트는 출력하지 않습니다.
핸들러가 없으면 기존 제공자 경로를 그대로 사용합니다.

`shortcodes.register(tag, { render(attrs, inner, context) })`는 저장된 본문의
단축코드를 제공 시점에 렌더링합니다. 태그는 소문자 영문으로 시작하는
영문·숫자·밑줄·하이픈 최대 64자이며, 속성은 문자열 사전입니다.
문맥은 `{ content: { id, type, slug } | null }`입니다.
예를 들어 문단의 `[notice title="안내"]내용[/notice]`를 안전한 HTML로 바꿉니다.
`content.html`과 동기화 패턴 확장 이후, 임베드 확장 이전에 실행됩니다.
문단·제목·목록·인용 등의 텍스트를 처리하며 코드·pre·HTML 속성과 실행 가능한 HTML 영역 안에서는 실행하지 않습니다.
인라인 결과는 인라인으로 삽입하고 블록 결과는 주변 문단을 나누어 삽입합니다.
알 수 없는 태그, 실패·시간 초과·등록 해제된 렌더링은 원문으로 남습니다.
중첩은 8단계로 제한하며 같은 등록과 입력은 요청 안에서만 캐시합니다.
누적 출력 한도에 도달하면 남은 태그의 렌더링과 정제를 중단하고 원문을 유지합니다.
플러그인 호출은 격리하고 반환 HTML은 공용 문서 정책으로 정제합니다.
등록이 없으면 본문 파싱도 하지 않습니다.

사이트·테마 함수도 같은 `shortcodes` 등록 API를 사용하며 소유자 scope가
종료되면 등록과 진행 중 결과를 회수합니다. `importShortcodes`는 가져오기
시점에 HTML을 문서 블록으로 변환하여 저장하는 API이고, `shortcodes`는
저장 내용을 바꾸지 않는 제공 시점 렌더링 API입니다.

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

`theme.public`은 공개 `PublicTheme` DTO를 받습니다. 스타일, 설정, 색상,
글꼴을 변경할 수 있지만 `id`, `templates`, `parts`는 변경할 수 없습니다.
반환값은 공개 테마 스키마로 다시 검증하며, 잘못된 결과는 적용하지 않습니다.
등록된 핸들러가 없으면 필터 호출과 추가 검증을 생략합니다.

`widgets.public`은 `{ sidebar, footer }` 형태의 `PublicWidgets` DTO를 받습니다.
표시 항목을 제거하거나 순서를 바꾸고 각 종류의 공개 필드를 수정할 수 있습니다.
기존 항목의 id와 종류를 유지해야 하며 중복 id나 새 항목을 추가할 수 없습니다.
반환값은 종류별 공개 위젯 스키마로 검증하고 변경된 HTML은 코어 문서
변환기와 렌더러를 거칩니다. 필터 실행 중 각 항목의 `settings`를 편집할 수 있습니다.
변경된 설정은 코어 종류별 스키마 또는 플러그인 `WidgetDefinition.settingsSchema`의
`safeParse`로 검증한 뒤 다시 렌더링합니다. 플러그인 검증은 격리되며 스키마가
없으면 설정 변경만 거부합니다. 설정은 공개 HTTP 응답에서 제거하고 저장값은
변경하지 않습니다. 핸들러가 없으면 추가 검증과 설정 복사를 생략합니다.

`theme.setup` 액션은 `{ theme: { id, version }, reason }`을 받습니다.
활성 테마 함수와 사이트 함수의 등록이 완료된 뒤 최초에는 `boot`,
테마 id 변경에는 `switch`, 소스 또는 버전 변경에는 `reload`로 호출합니다.
함수 파일이 없는 테마도 포함하며 변경 없는 재확인은 중복 호출하지 않습니다.

`editor.allowedBlocks` 필터는 `{ type, userId, blocks: string[] }`를 받습니다.
`type`과 `userId`는 고정이며 등록된 코어 노드 이름과 활성 플러그인 블록 이름
중에서 목록을 선택합니다. 이후 핸들러가 앞서 제외한 등록 블록을 다시 허용할 수 있습니다.
`GET /api/v1/admin/content/editor?type=post`와 웹 편집기 삽입기가 이 정책을
사용하며 저장·자동 저장 시 중첩 블록까지 검사합니다. 허용되지 않은 블록은
명확한 입력 오류로 거부하지만 기존 문서 조회와 렌더링은 막지 않습니다.
핸들러가 없으면 저장 경로에서 목록 생성과 문서 순회를 생략합니다.

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
  일반 메일 값은 `{ to, subject, text, html?, replyTo?, headers? }`입니다.
  `text`는 필수이며 HTML은 콘텐츠 가져오기와 같은 파서·렌더러 정책으로 정제합니다.
  헤더는 `X-Mailer`, `X-Priority`, `Importance`, `References`, `In-Reply-To`만
  허용합니다(최대 16개, 값 998자, CR/LF/NUL 금지). 수신·발신·MIME·라우팅 헤더는
  변경할 수 없습니다. SMTP와 HTTP 공급자는 text/html 대안을 함께 전달하며,
  플러그인 전송 계약도 기존 `text`와 선택적 `html`, `replyTo`, `headers`를 받습니다.
  사용자 지정 HTTP JSON 템플릿은 `{{html}}`, `{{replyTo}}`, `{{headers}}`를 지원합니다.
- `email.from`은 `{ name, address }`입니다. 주소는 설정된 발신 도메인과 같아야 하며,
  이름은 최대 200자이고 CR/LF/NUL을 포함할 수 없습니다.
- `email.system`은 `{ kind, subject, text, html? }`와 두 번째 인자
  `{ user: { id, name, email }, site: { title, url, locale } }`를 받습니다.
  현재 계정 템플릿 종류는 `reset`, `invite`(새 사용자 초대), `recovery`입니다.
  토큰 URL은 필터에서 `https://cms.invalid/action`으로 표시됩니다.
  text의 독립된 URL과 HTML의 링크 목적지는 이 값을 그대로 유지해야 합니다.
  코어는 검증과 HTML 정제 뒤 실제 URL을 변경 없이 복원합니다.
  링크 제거·변조 또는 잘못된 결과는 무시하고 이전 유효 값(최초에는 코어 메일)을 유지합니다.
  컨텍스트에는 토큰·해시·전송 비밀 값이 없습니다.
- HTTP 호출 순서는 `http.requestAllowed` → `http.request` → 기존 egress 정책·SSRF 검사
  → `http.responded`입니다. 등록된 핸들러가 없으면 투영·복제·시간 측정을 생략합니다.
  `http.requestAllowed`는 `{ service, host, allowed }`이며 후속 필터가 허용과 거부를
  모두 뒤집을 수 있습니다. 서비스·호스트는 변경 불가이며 최종 허용도 사설망 허용 목록과
  SSRF 검사를 우회하지 못합니다.
- `http.request`는 `{ service, method, url, headers }`입니다. `url`은 자격 증명이
  경로·쿼리에 포함될 수 있어 원본 URL의 origin만 노출하는 읽기 전용 값입니다.
  실제 URL·호스트·메서드는 변경되지 않습니다. 헤더는 `Accept`, `Accept-Language`,
  `Content-Type`, `Cache-Control`, `If-Modified-Since`, `If-None-Match`, `User-Agent`,
  `Traceparent`, `Tracestate`, `X-Request-Id`만 수정할 수 있습니다(대소문자 무관,
  최대 32개, 값 4096자, CR/LF/NUL 금지). 인증·쿠키·Proxy 및 기타 자격 증명 헤더는
  노출하거나 변경하지 않습니다.
- `http.responded` 액션은 `{ service, host, status: number | null, durationMs }`입니다.
  매 호출 완료 시 발행되며 거부·DNS·네트워크 실패에는 `status: null`을 사용합니다.
  본문·헤더는 전달하지 않습니다.
- `import.item`과 `content.beforeSave`에는 비밀번호가 없습니다. 코어가 필터 전에 항목의
  비밀번호를 제거하고 이후 원래 값을 다시 적용하므로, 필터는 비밀번호를
  읽거나 설정하거나 바꿀 수 없습니다.
- 코어 액션 구독(코어 웹훅)은 `HookBus.core`로 등록하며, 플러그인 컨텍스트는
  이를 받지 못합니다. 이들은 격리나 시간 제한 없이 직접 실행되고
  `emit`이 기다립니다. 실패는 코어 오류로 기록되고 `emit`을 거부합니다. 발행자는
  커밋 뒤 기다리지 않고 발행하므로, 커밋된 요청이 실패로 보고되지는 않습니다.
- `email.sendAllowed`는 `{ to, subject, allowed }`를 받습니다. 거부는
  후속 필터에서 되돌릴 수 있습니다. 최종 거부는 작업을 재시도하지 않고 영구 실패로 처리합니다.
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

`export.item`은 비밀번호 없는 코어 WXR 항목(패턴·댓글 포함)을 수정하거나 `null`로 제외합니다. 반환값은 WXR 항목 스키마로 다시 검증하며 잘못된 값은 무시합니다. 처리기가 없으면 기존 댓글 스트리밍을 유지합니다. 처리기가 있으면 항목별 댓글을 모아 전달합니다. `export.data`는 기존처럼 추가 항목에만 적용됩니다.

`importShortcodes.register(tag, { convert(attrs, inner) })`는 가져오기 중 코어가 모르는 단축코드를 HTML 문자열로 변환합니다. 태그는 소문자 영문으로 시작하는 영문·숫자·밑줄·하이픈 최대 64자이며 코어 태그는 재정의할 수 없습니다. 속성은 문자열 사전, 내부 내용은 문자열입니다. 반환 HTML은 코어 문서 파서를 거쳐 안전한 블록으로 저장됩니다. 실패·시간 초과·잘못된 반환값이면 원문을 유지합니다. 플러그인 호출은 격리 및 시간 제한을 적용하며 등록 해제 후 진행 중 결과도 폐기합니다.

`privacyExporters.register(key, { export(user) })`의 `user`는 확인된 요청의 `{ email: string }`만 포함합니다. 반환값은 JSON 값 사전이며 전체 추가 데이터는 1MiB 이하로 검증됩니다. 결과는 개인정보 내보내기의 `extensions["소유자:key"]`에 병합하고 기존 `privacy.exportData` 필터에 전달합니다. 코어 개인정보 섹션은 변경하지 않습니다. 실패·시간 초과·해제·잘못된 결과는 제외하며 다른 제공자는 계속 실행합니다. 두 등록소 모두 플러그인·사이트 함수·테마 함수 컨텍스트에 제공하고 소유자 스코프 해제 시 등록을 제거합니다.

작업 액션: `job.completed`는 큐 완료 저장 성공 뒤 `{ id, kind, attempts }`를 전달합니다(시도 횟수는 이번 성공 시도 포함). `task.completed`와 `task.failed`는 실행한 예약 작업의 `{ name, durationMs }`를 전달합니다. 임대를 얻지 못한 작업은 발행하지 않습니다. 실패 액션의 `error?: string`은 선택 사항이며 코어는 자격 증명이 포함될 수 있는 예외 메시지를 전달하지 않습니다. 처리기가 없으면 시간 측정과 페이로드 생성을 생략합니다.

`task.interval` 필터는 등록·재등록 시 `{ name, intervalMs }`를 전달합니다. 이름은 변경할 수 없으며 간격은 정수 밀리초, 최대 2,147,483,647입니다. 플러그인·함수 작업의 최소값은 60,000ms입니다. 코어 작업은 등록 시 선언한 기존 간격을 최소 안전값으로 유지합니다(큐 처리 5,000ms, 유지 관리 3,600,000ms 등). 첫 실행은 필터 완료를 기다리고, 실행 중에는 필터를 재평가하지 않습니다.

| 확장        | API                           | 설명                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 플랫폼 액션 | `hooks.on(name, handler)`     | `email.sent/failed`(수신 주소만), `email.settingsUpdated`, `job.failed`, `webhook.created/updated/deleted/delivered/failed`, `plugin.installed/activated/deactivated/removed/upgraded`(id·version·status만), `import.completed`, `export.generated`(WXR 스트림 완료), `site.installed`(사이트 정보만), `egress.updated`. 비밀 값 제외, 저장 성공 뒤 발행 |
| 플랫폼 필터 | `hooks.filter(name, handler)` | `email.beforeSend`, `email.from`, `email.system`, `email.sendAllowed`(양방향), `http.request`, `http.requestAllowed`(양방향), `webhook.payload`(JSON 객체), `export.data`(추가 WXR 항목), `import.item`(날짜는 Date, 비밀번호 제외), `dashboard.data`(권한 검사 뒤 위젯). 잘못된 반환값 무시                                                             |

가져오기 액션: `import.started`는 권한·옵션 검증과 WXR 파싱 성공 뒤 `{ source: 'wxr', items: number }`를 전달합니다. `items`는 필터 적용 전 파일의 전체 항목 수입니다. `import.itemImported`는 콘텐츠 저장 성공 직후 `{ sourceId: string, contentId: string, type: string }`를 전달하며 건너뛴 항목에는 호출하지 않습니다. 본문·비밀번호·토큰은 포함하지 않습니다. 처리기가 없으면 페이로드 생성과 호출을 생략합니다. 기존 `import.item` 필터와 `import.completed` 액션은 유지됩니다.

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
