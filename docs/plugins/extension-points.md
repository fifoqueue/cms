# 플러그인 확장 지점

상위 문서: [AGENTS.md](../../AGENTS.md)

모든 확장 지점은 범용이며, 도메인별로 나눠 정리했습니다. 새 행은 해당 도메인 아래에 추가하고, 도메인이 없으면 소제목을 새로 만듭니다. 확장 원칙은 [아래](#확장-원칙-wordpress-수준)에 있습니다. 작성 방법은 [authoring.md](authoring.md), 수명주기·격리는 [lifecycle-and-isolation.md](lifecycle-and-isolation.md)를 봅니다.

## Core

Menu resolver functions may expose `label` and optional `objects({ search, page, pageSize })`,
returning `{ items: [{ id, label }], total }`. Pickers run with provider isolation,
validation and a maximum page size of 100. SDK `menus.types()` discovers plugin
types; `menus.objects(type, query)` queries them. `MenuItem.taxonomy` accepts registered
taxonomy keys; disabled taxonomies are omitted from public menus without deleting settings.
Theme contributions appear in site-editor entries with `source` and `readOnly`;
save a template/part customization to override them, reset it to restore the provider default.

Admin SDK `patterns.contributions()` returns `{ key, source, patterns }[]`;
`source` identifies the plugin that supplied the selected valid contribution.
`roles.capabilities()` returns `{ key, label, source }[]`. Role definitions also
carry `source`: `core`, a plugin id, or `admin` for saved customizations.

Frontend servers use `createContentClient(...).seo.filter(kind, value, proof)`
or `seo.filterBatch(inputs, proof)` (1–7 inputs, ordered results). Both send the
frontend secret and visitor address; never expose the proof to browsers.
`seo.providers()` lists sitemap provider keys; `seo.sitemap({ kind, page, pageSize })`
accepts any registered provider key.

| 능력      | API                                                                                  | 설명                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 액션 훅   | `hooks.on(name, handler)`                                                            | `content.created/updated/published/trashed/restored/deleted`, `media.uploaded/deleted`, `comment.created/statusChanged`, `site.updated`. 결과에 영향 없음                                                                                                                                                                                                                                                    |
| 필터 훅   | `hooks.filter(name, handler, prio?)`                                                 | `content.beforeSave`(저장 직전, 비밀번호 제외·변경 불가), `content.public`(공개 API 단건 응답 직전, 본문 포함), `content.publicSummary`(공개 목록 항목 응답 직전, 본문 없음), `comment.beforeSave`(방문자 댓글 저장 직전; `body`·`status`만 반영). 낮은 prio 먼저                                                                                                                                            |
| 슬롯      | `slots.provide(slot, renderer)`                                                      | `head`, `site.header`, `site.footer`, `content.before`, `content.after`, `comments.before`, `comments.after` 에 HTML 주입                                                                                                                                                                                                                                                                                    |
| 위젯      | `widgets.provide(key, { name, render })`                                             | 위젯 유형 `plugin:<id>:<key>`. 관리자가 사이드바/푸터 영역에 배치하고 `render(settings)`의 HTML이 표시됩니다(실패 시 해당 위젯만 빠짐)                                                                                                                                                                                                                                                                       |
| 임베드    | `embeds.register({ name, render })`                                                  | 에디터 임베드 블록의 주소를 플레이어 HTML로 바꿉니다. 코어 제공자(YouTube·Vimeo)가 먼저 판단합니다                                                                                                                                                                                                                                                                                                           |
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

## Content

| 확장             | API                                          | 설명                                                                                                                                                                                              |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 콘텐츠 액션      | `hooks.on(name, handler)`                    | `content.scheduled`(예약 생성·변경), `content.revisionRestored`(복원 저장 후): 관리자 콘텐츠 DTO. `term.created/updated/deleted`: 저장 확정 뒤 관리자 용어 DTO                                    |
| 콘텐츠 정의 액션 | `hooks.on(name, handler)`                    | `contentType.created/updated/deleted`, `field.created/updated/deleted`: 저장 확정 뒤 정의 DTO. `permalinks.updated`: 경로 재생성 성공 뒤 설정 DTO                                                 |
| 콘텐츠 정의 필터 | `hooks.filter(name, handler)`                | `contentType.beforeSave`, `field.beforeSave`: 검증된 입력을 받고 결과를 동일 스키마로 재검증. 수정 시 기존 key 유지                                                                               |
| 용어 필터        | `hooks.filter(name, handler)`                | `term.beforeSave`(검증된 입력, 결과 재검증), `term.query`(관리자 목록의 taxonomy), `term.public`(공개 단건·목록 DTO). 잘못된 결과는 무시                                                          |
| 콘텐츠 조회 필터 | `hooks.filter('content.query', handler)`     | 권한 확인 뒤 관리자 목록 조회 인자. 결과를 동일 스키마로 다시 검증                                                                                                                                |
| 콘텐츠 변경 액션 | `hooks.on(name, handler)`                    | `content.termsChanged`: 콘텐츠 저장 시 할당 ID 집합이 바뀐 경우 관리자 DTO. `content.revisionSaved`: 리비전이 저장된 콘텐츠 DTO. `content.autosaved`: `{ contentId, revision }` 관리자 리비전 DTO |
| 콘텐츠 주소 필터 | `hooks.filter('content.permalink', handler)` | 공개 단건·목록의 `{ contentId, path }`. 해당 콘텐츠가 소유한 현재·별칭 경로만 허용. 잘못된 결과는 경고 후 무시. 새 경로는 permalink token으로 생성                                                |
| 콘텐츠 거부 필터 | `hooks.filter(name, handler)`                | `content.publishAllowed`, `content.deleteAllowed`: boolean, 코어 권한 확인 후 추가 거부만 허용. 앞선 거부를 true로 뒤집을 수 없음. 예약 발행과 휴지통 자동 정리에도 적용                          |

Deleting a taxonomy term emits `term.deleted`, then `content.termsChanged` for each surviving affected entry (admin DTOs read after commit). Scheduled publication and automatic trash cleanup emit the lifecycle action per affected entry.

`contentTypes.register(key, definition)`, `taxonomies.register(key, definition)`,
and `fields.register(key, definition)` declare static, schema-validated definitions
under `plugin:<plugin-id>:<key>`. Core content types and category/tag taxonomies
use the same registries. Registration disposal hides declarations without deleting
stored content, terms, assignments, or field values. Inactive plugin fields are
omitted from public output but their values survive subsequent validation.
Administrator definition writes cannot claim plugin namespaces. These declarations
have no runtime callbacks; activation and its registrations use the host's existing
isolation and scope cleanup.

`permalinkTokens.register(key, resolver)` resolves `%key%` from a copied
`PermalinkValues` object. Plugin results must be decoded safe segments; separators,
dot segments, controls and percent signs are rejected and accepted text is encoded
once. Calls are isolated and time-limited. Failure falls back to the core token
of the same name, or empty text for custom tokens. Disposal removes the resolver.
Core tokens use the same lookup; category/page hierarchy tokens retain their
existing multi-segment behavior.

Category and author changes refresh core-token paths in their metadata transaction.
Custom-token paths are queued with merged content IDs (a pending full rebuild stays
full). After commit the repository starts regeneration without awaiting it; the
five-second scheduler retries failures. Content saves remain available: they compute
their own paths and invalidate pending worker progress, whose snapshot is checked
again under the path lock before committing. Previously published paths remain redirects.

## Media

At most 32 distinct image-size names are active, including core sizes. Earlier distinct registrations take the available slots; excess names are logged and omitted by `list()`. This bounds derivative work and the variants JSON stored in the TEXT column. Oversized processed originals fall back to core cleaning of the original upload.

Image-size declarations validate names against `[a-z][a-z0-9-]{0,63}` and dimensions as integers from 1 to 8192 pixels. `height` is optional; `crop` defaults to false. Cropping uses a centered cover fit; otherwise the image fits inside the requested bounds, preserving aspect ratio. Neither mode enlarges the source. Plugin deactivation removes declarations, not already-generated files.

`mediaProcessors.register({ process({ bytes, mime }) })`는 JPEG/PNG/WebP/AVIF 업로드의 최적화 바이트를 반환합니다. 호출은 복사·시간 제한·반환값 검증을 거치며 실패/비활성화는 이전 바이트로 진행합니다. 같은 처리 계약의 코어 재인코딩은 컴포지션 루트 전용 `registerCore`로만 등록되고(플러그인 등록 API로는 접근 불가) 마지막에 격리 없이 직접 실행되므로 메타데이터 제거를 우회하지 못합니다. 코어가 디코딩하지 못하는 플러그인 출력이나 처리된 바이트의 업로드 크기 제한 초과는 잘못된 플러그인 출력으로 보고 원본으로 코어 재인코딩합니다. 원본에 대한 코어 실패(또는 코어 미등록)는 숨기지 않고 업로드 오류로 전달합니다. SVG·GIF·문서/오디오/비디오는 아직 이 파이프라인 대상이 아닙니다.

알려진 미디어 출력 확장 공백: `media.public`은 아직 연결되지 않았습니다. 공개 이미지 DTO가 콘텐츠의 공개 SQL projection과 미디어 저장소 조회에서 각각 만들어지며 동기 매퍼에 비동기 훅을 넣을 수 없습니다. 콘텐츠·테마·사이트 출력 경계의 공통 비동기 projection 계약을 연결해야 하며, 일부 경로에만 필터를 적용하지 않습니다.

미디어·토론 추가 훅: `media.updated`(메타데이터 커밋 뒤 AdminMedia), `discussion.updated`(설정 저장 뒤 DiscussionSettings); `media.beforeSave`(메타데이터 입력 재검증), `media.filename`(저장 경로가 아닌 표시 이름), `media.uploadAllowed`(코어 업로드 검사 뒤 파일 이름·MIME·크기와 거부 전용 allowed), `discussion.beforeSave`(설정 입력 재검증).

`imageSizes.register({ name, width, height?, crop? })` registers an image size. Core sizes are declared by the registry itself, not through the plugin API, and win on collisions: a plugin registration for a core size name is refused with a warning, so plugins only add missing names. Among plugin registrations for the same name, the last one wins and unregistering restores the previous one. Uploads generate the active sizes; disabling a plugin stops future generation without deleting existing derivatives. `POST /api/v1/admin/media/:id/derivative?name=…` (authenticated) returns a non-cacheable WebP without persisting it. The web media picker and editor image size choice list the media DTO's `variants`, including plugin sizes (integrated).

## Comments

Moderators bypass `commentCheckers` but still run `comment.beforeSave`. `comment.notification.to` is fixed to the core recipient; filters may change subject/text only. A changed recipient invalidates the filter result.

`commentCheckers.register({ check(input) })`는 `{ status: 'approve' | 'hold' | 'spam', reasons: string[] }`을 반환합니다. 코어 토론 정책도 같은 등록소에 컴포지션 루트 전용 `registerCore`로 등록되며 가장 엄격한 판정을 합칩니다. 코어 검사기는 격리 없이 직접 실행되고 예외·잘못된 반환값은 그대로 전달되어 댓글 제출이 실패합니다(승인으로 바뀌지 않음). 플러그인 실패·시간 초과·잘못된 반환값은 무시하고 비활성화 때 등록을 해제합니다. 기존 `comment.beforeSave`는 이 판정 뒤에 그대로 실행됩니다.

| 댓글 확장 | 계약                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 액션      | `comment.updated`, `comment.deleted`: 커밋된 댓글; 삭제는 단건·일괄·자동 정리 포함. 답글은 기존 `comment.created`의 `parentId`로 식별. 상태 변경은 기존 `comment.statusChanged`를 항목별 발행.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 필터      | `comment.query`: 관리자 목록 조건, `comment.public`: 공개 댓글 DTO, `comment.notification`: 발송 전 to/subject/text, `comment.submitAllowed`: 코어 검사 이후 contentId/authorName/authorEmail/address와 거부 전용 allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 저장소    | `context.storageDrivers.register(key, { label, fields, connect(settings) })` registers `plugin:<owner>:<key>`. `PluginStorageDriver`, `MediaStorageDriver`, and `StorageDriverRegistrar` are exported from `@cms/sdk/plugin`. The returned adapter implements `commit`, ranged `read`, and idempotent `remove`. Core registration is not exposed; scope disposal revokes captured adapters without fallback. Settings fields follow mail transport types; secrets are sealed and excluded from DTO values. Existing keys must remain readable after provider settings change. Local/S3 inventory resync is core-only; plugin adapters currently expose delivery and cleanup, not enumeration. |

토론 설정 훅(`discussion.updated`, `discussion.beforeSave`)은 Media 절의 “미디어·토론 추가 훅”에 함께 있습니다.

## Users

Captcha providers may declare `widget: { script, render, origins, attributes, responseField }` alongside `label` and `verify`. Core Turnstile/hCaptcha/reCAPTCHA registrations use the same descriptor. `script` is a credential-free HTTPS URL (max 2048, no fragment); `attributes` allows at most 20 `data-*` names (max 80) with string values (max 1024); `responseField` matches `[A-Za-z][A-Za-z0-9_-]*` (max 100). The public DTO adds the derived `scriptOrigin`. These are trusted plugin-enqueued scripts, not sandboxed code; attributes must never contain secrets. Deactivation withdraws the widget with its verifier; an override never inherits an older registration's widget accidentally.

`render` defaults to null (auto-render). Otherwise it is a dotted global function path, at most 256 characters, matching `^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*){0,3}$`. Resolve it without eval and call `fn(container, { sitekey, callback })` per mount after the script is ready. Core paths are `turnstile.render`, `hcaptcha.render`, and `grecaptcha.render`, using explicit-render script URLs. Auto widgets initialize from data attributes and fill `responseField`; the API adds the public site key as `data-sitekey` only when that attribute is absent (the public map may consequently contain 21 entries).

`origins` defaults to `[]` and contains at most ten HTTPS CSP origins (max 2048 each), no paths, credentials, query, fragment or directive syntax; a leading wildcard subdomain such as `https://*.hcaptcha.com` is allowed. Scope the union of `scriptOrigin` and these hosts to the captcha page's script/frame/connect directives, not the whole site. hCaptcha additionally documents those hosts for style-src; Turnstile pre-clearance needs the page's existing connect-src `'self'`. Do not add unsafe-inline/unsafe-eval from descriptor data.

Core CSP sources were checked against [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [hCaptcha](https://docs.hcaptcha.com/#content-security-policy-settings), and [Google reCAPTCHA](https://docs.cloud.google.com/recaptcha/docs/faq): Turnstile uses `https://challenges.cloudflare.com`; hCaptcha uses `https://hcaptcha.com` and `https://*.hcaptcha.com`; reCAPTCHA uses `https://www.google.com`, `https://www.gstatic.com` and `https://recaptcha.google.com`. Google's documented path-specific sources are represented as origins by this contract.

Plugin manifest id `core` is reserved and rejected at installation. Core erasers and captcha verifiers enter through composition-root-only `registerCore` methods; plugin registrars cannot access them. Owner names and `core:` prefixes never confer core execution. Core captcha uses its own HTTP timeout, not the plugin isolation deadline.

Erasure results also carry `messages` (at most 20 strings, at most 500 characters each; omitted means `[]`). They are validated and included in the per-provider report. Treat them as plain text, never HTML. The web privacy erase screen shows every eraser's counts, messages and failures (integrated).

- `roles.register({ key, name, capabilities })` contributes role defaults through the same registry as built-ins. First registration wins; administrator-saved overrides and deletion tombstones take precedence. Deactivation withdraws unsaved defaults, not users or administrator-saved roles.
- `profileFields.register(key, { label, type, ...bounds })` declares private `pluginId:key` metadata (`text`, `number`, `boolean`). Account/admin APIs validate values and store them per user. Disabled fields remain stored and included in privacy export/erasure, but are not shown or writable.
- `captchaProviders.register(key, { label, verify })` adds `plugin:<id>:<key>` providers; the built-in keys `turnstile`, `hcaptcha`, `recaptcha` may also be overridden. Core registers through the same API. Exceptions, timeouts, invalid output and revoked registrations fall back to earlier implementations of that provider; no valid implementation means verification fails, never a bypass. A valid `false` is a denial, not a provider failure.
- `privacyErasers.register(key, { erase(request) })` registers an idempotent personal-data eraser returning `{ erased, retained }` (provider-defined units; core counts subjects). Core runs first through the registry, preserving transaction/last-administrator safeguards. Plugin calls are isolated and validated. The erase response reports `results` and `failed` provider IDs; plugin failure does not undo core erasure. Callbacks already running at timeout/disposal cannot be cancelled. Failed erasers require operator follow-up; core completion is not proof that plugin data was erased.

| 확장             | API                                       | 설명                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 사용자 관리 액션 | `hooks.on(name, handler)`                 | `user.created/updated/roleChanged/deleted`, `role.created/updated/deleted`, `security.updated`. 저장 성공 뒤에만 발행하며 비밀 값은 제외. 삭제는 `reassignTo`, 역할 변경은 `previousRole` 포함                                                    |
| 사용자 필터      | `hooks.filter(name, handler)`             | `user.beforeSave`(create/update/profile/role; 비밀번호 제외, 작업·대상 고정), `user.query`(관리 목록 role/search), `user.public`(공개 저자 DTO), `user.registrationAllowed`(거부 전용), `user.capabilities`(아래 권한 정책). 잘못된 반환값은 무시 |
| 개인정보 훅      | `hooks.on` / `hooks.filter`               | `privacy.requested/exported/erased`는 커밋된 요청 DTO(토큰 제외). `privacy.exportData`는 확인된 요청의 `data`에 플러그인 개인정보를 추가하며 코어 스트림을 대체하지 않음(직렬화 가능한 JSON, 최대 1 MiB). 요청 식별자는 고정                      |
| 차단 액션        | `hooks.on('protection.blocked', handler)` | 작업·차단 사유와 계정/주소의 도메인 분리 HMAC만 전달. 원문 계정·IP·캡챠 토큰·비밀은 제외                                                                                                                                                          |

`user.capabilities`는 신뢰하는 서버 플러그인에 한해 WordPress `user_has_cap`처럼 권한 추가·제거를 허용합니다. 인증이 확인된 사용자만 평가하며 익명은 훅을 실행하지 않고 권한이 없습니다. 선언된 capability 카탈로그에 없는 권한과 사용자/역할 식별자 변경은 거부합니다. 역할 자체의 권한을 넘는 추가는 `(plugin, user, capability)`별 프로세스 수명 동안 한 번 `warn`으로 기록합니다(정책 거부 전용 필터와는 별도). 선언된 capability 카탈로그는 아래 capability 등록소입니다. `RoleService.capabilities(role, userId)`에 인증된 id를 전달해야 필터가 적용됩니다.

`user.beforeSave` filters credential-free create/update/profile/role inputs; the operation and target identity stay fixed. `user.query` filters admin role/search criteria. `user.capabilities` permits grants and revocations for verified users only; unknown capabilities are rejected, and grants beyond role permissions are logged once per (plugin, user, capability) per process at `warn` level. `privacy.requested/exported/erased` publish committed, token-free request DTOs; `privacy.exportData` adds bounded JSON extensions without replacing core sections. `protection.blocked` exposes the action, reason and domain-separated account/address HMACs, never raw identifiers.

Capability registry: `capabilities.register({ key, label })` declares a capability and is revoked on deactivation. Core capabilities use the same registry and cannot be shadowed. Admins can assign registered capabilities to custom roles; undeclared capabilities are rejected, and removed registrations stop granting. `GET /api/v1/admin/capabilities` lists them (see [routes](../api/routes.md)). The web role editor labels them from this list, groups plugin capabilities by source and marks plugin-contributed roles (integrated).

## Appearance

Theme templates and parts win over plugin contributions. Contributions add only
missing template names/part slugs; saved administrator customizations retain
highest priority. Plugin patterns must pass active block-attribute validation
and the editor renderer's schema check before registration succeeds.

Contracts on `PluginContext`: `menuItemTypes.register(key, resolver)`,
`themeContributions.register(key, provider)`, and `patterns.register(key, definitions)`.
Core menu types and the base theme contribution use the same registries. Core
menu types enter through the composition-root-only `registerCore`, run without
plugin isolation and win on key collisions: a plugin registration for a core
menu type key (`home`, `custom`, `archive`, `content`, `term`) is refused with a
warning. All registrations are scope-owned: disabling/unloading revokes them, including
in-flight results. Provider exceptions, timeouts and invalid output fall through
to earlier registrations. Unknown plugin menu types disappear without deleting
their stored placements. Pattern contributions are non-persistent insertable
editor documents, exposed separately from saved/synced patterns.

Web (integrated): the block inserter lists contributed patterns labelled by plugin
and inserts copies; the menu editor offers each plugin item type with an object
picker (searchable when declared) and plugin taxonomies in the term picker; the
site editor marks plugin templates/parts “플러그인: <id>” until a saved
customization overrides them.

| Appearance / discovery hooks                                    | Contract                                 |
| --------------------------------------------------------------- | ---------------------------------------- |
| `theme.activated/installed/deleted`                             | Saved AdminTheme                         |
| `template.updated`, `templatePart.updated`, `styles.updated`    | Saved customization, including resets    |
| `menu.created/updated/deleted`, `menu.beforeSave`, `menu.items` | Menu lifecycle, input and output         |
| `widgets.updated`, `widgets.beforeSave`                         | Placement settings                       |
| `pattern.created/updated/deleted`, `pattern.beforeSave`         | Post-transaction DTO and validated input |
| `settings.updated`                                              | Reading/writing section and settings     |

## SEO

`feed.*`, `robots.txt`, `llms.txt`, `seo.meta`, `seo.markdown`, and plugin
sitemap kinds are **integrated in the web**: feeds, comment feeds, robots.txt,
llms.txt, `.md` views and every public page's meta/JSON-LD go through
`seo.filterBatch` (one call per document or page; `#lib/server/seo-filter.js`),
and the sitemap index lists every `seo.providers()` kind. The web must use
the unfiltered value when the filter RPC returns 403, 429, or any 5xx response.
Core registry providers are not isolated or timed out; their errors propagate.

`sitemaps.register(key, provider)` contributes or replaces a paginated provider.
Core `content`, `category`, `tag`, `author`, and `taxonomy` providers register
through this contract. Providers receive `{ page, pageSize, siteUrl }` and return
`{ items, total }`; items use `seoSitemapEntrySchema`. Enumerate keys with
`GET /api/v1/seo/providers` and fetch pages with `GET /api/v1/seo/sitemap?kind=key`.
`sitemap.entries` is applied once to each returned page.

| SEO / discovery hooks                                                         | Contract                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| `seo.updated/beforeSave/public`                                               | Settings hooks                           |
| `sitemap.entries`, `feed.items/channel`, `robots.txt`, `llms.txt`, `seo.meta` | Validated discovery output               |
| `seo.markdown`                                                                | Markdown string via trusted frontend RPC |

Markdown views submit their rendered public Markdown string as
`{ kind: 'seo.markdown', value }` to the trusted frontend filter RPC before
returning the `.md` response. The same validation/fallback rules apply.

A feed-type registry is not provided: final feed routing and serialization live
in the web app, so an API-only registry would advertise types the web cannot
serve. The existing `feed.items` and `feed.channel` filters cover content and
comment feeds. Adding feed types requires a coordinated frontend routing and
serializer contract, rather than an inert API registration.

Discovery integration: sitemap pages from `GET /api/v1/seo/sitemap` already apply
`sitemap.entries`. Other frontend serializers must POST `{ kind, value }` to
`/api/v1/seo/filter` before escaping XML/HTML or returning text. The SDK plugin
export `discoveryFilterSchemas` defines each value. Feed items use
`id/title/link/description/publishedAt/author?`; channels use
`title/link/description/language?`; meta uses
`title/description/canonicalUrl/og/jsonLd`. Both post and comment feeds use this
contract. Text values are strings. Submit public presentation data only.

The filter RPC requires both `SSO_FRONTEND_SECRET_HEADER` and a valid
`SSO_CLIENT_ADDRESS_HEADER`. `ClientResolver` checks the secret with its existing
constant-time digest comparison. Missing/invalid proof is forbidden before body
reads or plugin execution. Requests are streamed with a 512 KiB limit; each API
process admits 6,000 calls/minute per proved visitor network and 60,000 overall.
The web serializer remains responsible for XML/HTML/JSON-LD escaping.

## Search

`search.indexed` fires after engine writes, outbox acknowledgement and sync-state
persistence succeed. Payload: `{ operation: 'rebuild' | 'update', contentIds }`;
`contentIds: null` denotes a full rebuild. Incremental IDs include removals.
Failures and empty syncs do not emit it. Connection secrets are never exposed.

`searchEngines.register(key, engine)` receives validated search arguments and
returns ranked `{ ids, total }`, or `null` to decline. Last registration is tried
first; core Meilisearch and database providers use the same registry. Failure,
timeout, invalid results or revocation tries the next provider. Public summaries
are always hydrated through the published-content reader. Queries outside the
accelerator contract (for example author scopes) retain the direct DB path.
Query/results hooks wrap both paths exactly once; result filters may reorder or
remove the current page's IDs, not introduce IDs outside that page.

| Search hooks                    | Contract                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `search.query/results/document` | Public search query, ranked ids/total, indexed public document; document identity is immutable |

## Platform

Security and output bounds:

- `email.beforeSend` cannot change any recipient. Password reset/invite, recovery
  and privacy messages are marked `sensitive` and never reach `email.beforeSend`:
  their subject and text carry tokens, so they are sent unfiltered.
- `import.item` and `content.beforeSave` are password-free: core strips the entry
  password before the filter and re-applies the original afterwards, so filters can
  neither read nor set or change it.
- Core action subscriptions (core webhooks) register through `HookBus.core`, which
  plugin contexts never receive. They run directly (no isolation or timeout) and are
  awaited by `emit`; a failure is logged as a core error and rejects `emit`. Publishers
  emit after commit without awaiting, so a committed request is not reported as failed.
- `email.sendAllowed` receives `{ to, subject, allowed }`; denial cannot be
  reversed and permanently fails the job rather than retrying.
- `webhook.payload` filters only `data`; core preserves id/event/occurredAt.
  Serialized deliveries are capped at 64 KiB (oversized filter output is ignored).
- `dashboard.data` receives `{ widgets, capabilities }`. Only removal/reordering
  of authorized, unchanged widgets is accepted; identity/content/capability changes
  and duplicate widgets are rejected.
- `export.data` additions are capped at 16 MiB serialized JSON in total.
- Plugin mail has a 60-second default delivery bound, not the short hook timeout.
  Timed-out external work cannot be cancelled; transports should use idempotency
  where possible to avoid duplicate delivery on retry.
- Health detail is limited to 100 strings, each at most 2,048 characters.
- Plugin job input is limited to 64 KiB serialized UTF-8 JSON. Core stores the
  validated cloned input, not the schema's transformed output. Execution validates
  again. Key recovery includes every currently registered job kind, including plugins.

### Site health checks

`context.healthChecks.register(key, check)` registers `plugin:<id>:<key>`.
The callback returns `{ status: 'good' | 'recommended' | 'critical', detail: string[] }`.
All seven core checks use the same registry through its core-only `registerCore`
path (plugin contexts only reach namespaced plugin registration). Core checks run
directly without isolation or timeout; their errors propagate and fail the report.
Plugin results are validated and calls are time-limited. Throwing, invalid, or
timed-out plugin checks become a critical `check failed` result; exception details
never reach the response. Deactivation revokes checks and late registrations are
rejected.

### One-off plugin jobs

`context.jobs.register(kind, { schema, run })` registers a kebab-case local kind
as `plugin:<id>:<kind>`. `schema` is a zod schema; `run` receives validated JSON.
`context.jobs.enqueue(kind, payload, { delayMs? })` validates and seals every
payload before durable storage. Delay defaults to zero and is bounded to
2,147,483,647 milliseconds. Handlers use the core job runner's leases and retry
policy, with a 60-second execution limit. Registration is revoked on plugin
deactivation; late enqueue calls are rejected. A queued job whose handler is no
longer registered fails as an unknown kind rather than executing disabled code.

| 확장        | API                           | 설명                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 플랫폼 액션 | `hooks.on(name, handler)`     | `email.sent/failed`(수신 주소만), `email.settingsUpdated`, `job.failed`, `webhook.created/updated/deleted/delivered/failed`, `plugin.installed/activated/deactivated/removed/upgraded`(id·version·status만), `import.completed`, `export.generated`(WXR 스트림 완료), `site.installed`(사이트 정보만), `egress.updated`. 비밀 값 제외, 저장 성공 뒤 발행 |
| 플랫폼 필터 | `hooks.filter(name, handler)` | `email.beforeSend`(to·subject·text 검증, 민감 메일 제외), `email.sendAllowed`(거부만), `webhook.payload`(JSON 객체), `export.data`(코어 스트림 뒤에 추가할 WXR 항목 배열), `import.item`(항목별, 날짜는 Date, 비밀번호 제외), `dashboard.data`(권한 검사 뒤 위젯 배열). 잘못된 반환값 무시                                                               |

Email transports: the existing `transport: 'smtp' | 'http'` and providers are unchanged. An optional `pluginTransport` (input `{ id, values, secrets }`; output `{ id, values, secretsConfigured } | null`) overrides them, and `null` selects the legacy transport (web: integrated in the email settings screen). Core seals the secrets: omitted keys are kept, `''` removes one, and changing the transport id does not reuse credentials. `availableTransports: { id, label, fields }` lists the choices; fields are `{ key, label, type: text | number | boolean | secret, required }`. If a selected plugin transport fails or is removed, the send fails (retried as usual) and never falls back to another provider. Plugins register one with `context.mailTransports.register(key, definition)`.

## Sign-in

`user.secondFactorRequired` is monotonic (not bidirectional): plugins may add a requirement but cannot clear one imposed by the role policy or an earlier filter. A weakening result is ignored and logged. Core UV-passkey authentication has already satisfied the base requirement; plugins may still require an additional factor. `SignInRequest.client` carries the proved normalized visitor key (IPv6 /64), or null when unproved; `address` is not a rate-limit key.

Sign-in methods and second factors are a registry shared by core and plugins: `context.auth.signInMethod/secondFactor`, ids `plugin:<id>:<key>`. Hooks: `user.signedIn`, `user.signInFailed`, `user.secondFactorChanged`; filters `user.signInAllowed` (deny-only) and `user.secondFactorRequired`. Details: [sign-in.md](../auth/sign-in.md).

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
