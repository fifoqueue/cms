# AGENTS.md

이 저장소에서 작업하는 모든 에이전트와 사람을 위한 규칙입니다. **"반드시"/"금지"로 표시된 항목은 예외 없이 지킵니다.** 규칙과 충돌하는 요청을 받으면 구현하기 전에 충돌을 알리세요.

## 1. 개요

WordPress·Ghost 같은 **headless CMS** 입니다.

- `apps/api` — 콘텐츠를 저장·처리·발행하는 API 백엔드. 플러그인 런타임을 포함합니다.
- `apps/web` — API의 콘텐츠를 보여주는 공개 사이트(테마)와 관리자 화면.
- 둘은 **HTTP API로만** 통신합니다. 서로의 코드를 import 하지 않습니다.

| 영역      | 기술                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| 런타임/PM | Bun (`bun`, `bunx`) — npm·yarn·pnpm 사용 금지                                   |
| 언어      | TypeScript (strict)                                                             |
| API       | ElysiaJS 1.4 (Bun 런타임), Prisma 7 + `@prisma/adapter-mariadb`                 |
| DB        | MariaDB                                                                         |
| Web       | SvelteKit 3 (Svelte 5 runes), adapter-node, Tailwind 4, shadcn-svelte (bits-ui) |
| 에디터    | Tiptap 3 (스키마는 `@cms/content` 하나로 공유)                                  |
| 검증      | zod 4 (스키마는 `@cms/sdk`에서 공유)                                            |
| 품질      | ESLint 10 (flat config) + Prettier 3                                            |

## 2. 빠른 시작

```bash
bun install
docker compose up -d                          # MariaDB (또는 기존 MariaDB 사용)
bun run --filter @cms/api db:generate         # Prisma Client 생성 (src/infra/prisma/generated)
bun run dev                                   # API :4000 + Web :5173 → 첫 설치 마법사
```

API와 웹은 병렬로 실행됩니다. 개별 실행은 `bun run dev:api`, `bun run dev:web`을 사용합니다.

첫 접속은 `/admin/setup`으로 안내됩니다. API 콘솔의 설치 키와 MariaDB 접속 정보를
입력하면 연결 확인·마이그레이션·설정 저장이 자동으로 진행됩니다. 로컬 Docker 기본값은
호스트 `localhost`, 포트 `3306`, DB/사용자/비밀번호 `cms`입니다. 운영에서는 미리 생성한
별도의 DB와 테이블 생성 권한이 있는 계정을 사용하고 HTTPS로 설치하세요.
다음 단계에서 사이트 정보와 첫 관리자 계정을 만들면 자동 로그인되고 재설치는 차단됩니다.
DB/사용자 자체를 생성하거나 기존 데이터를 초기화하지는 않습니다.

접속 정보는 `apps/api/data/config.json`에 저장됩니다(`.env` 편집 불필요).
이 파일은 비밀번호를 포함하므로 공개하지 말고 DB와 함께 백업하세요. Unix에서는 파일
권한 `0600`으로 생성하며, Windows에서는 서비스 계정만 읽도록 폴더 ACL을 설정하세요.
설치 키는 재시작할 때 바뀌며 설치 미완료 시에만 콘솔에 표시됩니다.
중간에 중단한 설치는 저장된 DB 설정으로 이어갑니다. DB 연결 장애나 손상된 설정은
새 설치로 취급하지 않습니다. 기존 `DATABASE_URL` 환경변수는 저장된 파일보다 우선하고,
다른 고급 환경변수도 유지됩니다. 시작 시 마이그레이션이 자동 적용됩니다.

`apps/web`은 `CMS_API_URL`(기본 `http://localhost:4000`)로 API를 찾습니다. 프로덕션에서 플러그인 업로드(최대 5MB)를 받으려면 웹 서버에 `BODY_SIZE_LIMIT=6M` 을 설정하세요.

변경을 마치기 전에 **반드시** 루트에서 실행합니다.

```bash
bun run check   # prettier --check → eslint → 모든 패키지 typecheck → bun test
```

## 3. 저장소 구조

```
packages/
  sdk/        @cms/sdk      공유 계약: DTO·zod 스키마(index), 플러그인 API(plugin), HTTP 클라이언트(client)
  content/    @cms/content  Tiptap 확장 목록(에디터·렌더러 공용), 서버 렌더러(render)
apps/
  api/        @cms/api      코어 백엔드
    prisma/                 schema.prisma, migrations/
    src/
      shared/               도메인 무관 유틸: errors, validation, isolate, logger
      domain/               유스케이스와 포트(인터페이스). content/, auth/, site/, ports.ts
      plugin-runtime/       플러그인 수명주기·확장 지점: hook-bus, slot-registry, route-registry(선언만 보관), plugin-host …
      infra/                어댑터: prisma/, plugins/(파일시스템·동적 import), system.ts
      http/                 app.ts(createApiApp·createInstallerApp, 오류 매핑), services.ts(DI 타입), session.ts(인증 가드), plugin-gateway.ts, request/respond, routes/{api,install}/** (파일 경로 = URL)
      container.ts          컴포지션 루트 — 구현체를 아는 유일한 파일
      main.ts               부트스트랩
    test/                   bun test, test/support 의 인메모리 어댑터
  web/        @cms/web      SvelteKit 앱
    src/routes/(site)/      공개 테마
    src/routes/admin/       관리자 ((auth): 로그인·셋업, (app): 인증 필요)
    src/lib/server/         API 클라이언트 생성, 세션, 폼 파싱 (서버 전용)
    src/lib/admin/          관리자 컴포넌트 (Editor, ContentForm, PluginSettingsForm …)
    src/lib/theme/          테마 컴포넌트 (SlotOutlet …)
    src/lib/components/ui/  shadcn-svelte 생성물 (직접 수정 최소화)
plugins/
  reading-time/  @cms-plugin/reading-time  예제 플러그인 (빌드 결과를 관리자 화면에서 업로드)
```

## 4. 절대 규칙

### 4.1 SOLID (엄격)

- **S** — 한 모듈/클래스는 한 가지 이유로만 바뀝니다. 예: `PluginHost`(수명주기), `PluginSettings`(설정 값), `PluginScope`(등록 해제), `FsPluginPackageStore`(파일), `dynamicImportLoader`(import)는 서로 분리돼 있습니다. 새 책임은 새 모듈로 만듭니다.
- **O** — 기능 추가는 기존 코드 수정이 아니라 **확장**으로 합니다. 새 HTTP 기능은 `http/routes/` 아래에 라우트 파일을 하나 추가합니다(기존 파일·목록은 수정하지 않습니다). 새 동작은 가능하면 플러그인으로 만듭니다.
- **L** — 포트의 모든 구현체는 같은 계약을 지킵니다. 예: `MemoryContentRepository`(테스트)와 `PrismaContentRepository`는 슬러그 충돌 시 둘 다 `conflict`를 던집니다. 포트 주석에 적힌 계약을 구현체가 어기면 안 됩니다.
- **I** — 인터페이스는 작게 나눕니다. 클라이언트는 `createContentClient`(공개)·`createAuthClient`·`createAdminClient`로 분리돼 있고, 플러그인 컨텍스트는 `hooks/slots/routes/settings/storage/content/logger` 능력 단위로 나뉩니다.
- **D** — `domain/`, `plugin-runtime/`, `shared/`는 **인터페이스(포트)에만** 의존합니다. Prisma·파일시스템·Bun API 같은 구체 구현은 `infra/`에만 있고, 연결은 `container.ts`에서만 합니다. 이 방향은 ESLint가 강제합니다.

### 4.2 코어 ↔ 플러그인

- **금지**: 코어(`apps/*`, `packages/*`)가 특정 플러그인을 참조하는 것. import, 플러그인 id 문자열 비교, 플러그인 이름으로 분기, 플러그인 전용 테이블/컬럼/엔드포인트 모두 포함합니다. (`@cms-plugin/*`·`plugins/` import는 ESLint가 막습니다.)
- **금지**: 플러그인 하나만을 위한 규약(훅·슬롯·필드·API) 추가. 새 확장 지점은 **여러 플러그인이 쓸 수 있는 범용 형태**로만 추가하고, 추가 전에 "다른 종류의 플러그인 두 개가 이걸 쓸 수 있는가?"를 확인하세요.
- **반드시**: 비활성화·삭제·실패한 플러그인이 코어 동작을 방해하지 않아야 합니다(5.4절 보장 참고). 코어 기능은 플러그인이 하나도 없을 때 완전히 동작해야 합니다.
- 플러그인은 `@cms/sdk` 와 `@cms/sdk/plugin` 만 의존합니다. `@cms/api`, `@cms/web`, `@cms/content`, `@prisma/*` import는 금지(ESLint 강제).

### 4.3 코드 스타일

- **named import/export 사용.** `import * as` 금지, default export 금지, default import는 `.svelte`·에셋(`.svg` 등)·CSS 와 도구 설정 파일(`*.config.*`)에서만 허용(ESLint 강제). 타입은 `import type`.
- Prettier: 2-space, LF, singleQuote, trailingComma `all` (`.prettierrc`, `.editorconfig`, `.gitattributes`).
- 신뢰 경계(HTTP 입력, 폼 입력, 플러그인 반환값, 업로드된 번들)에서는 **반드시** zod 등으로 검증합니다. 공유 스키마는 `@cms/sdk`에 둡니다.
- 예상된 실패는 `DomainError`(`invalid_input`/`unauthorized`/`not_found`/`conflict`/`rate_limited`(429))로 던집니다. HTTP 상태 매핑은 `http/respond.ts` 한 곳에만 있습니다.
- 웹 앱에서 `#lib/...` 경로는 `.js` 확장자를 붙입니다(`#lib/server/api.js`). 링크는 `resolve()`(`$app/paths`)로 만듭니다.

### 4.4 패키지와 버전

- 패키지 관리자와 런타임은 **Bun만** 씁니다. `bun add`, `bun remove`, `bun update --latest`, `bunx`.
- 의존성은 **확인 가능한 최신 안정 버전**을 유지합니다. 추가·갱신 시 `npm view <pkg> version`/`bun outdated`로 확인합니다.
- 현재 의도적인 예외 (해제 조건이 충족되면 즉시 올리세요):
  - `typescript` 6.x — TS 7(네이티브)은 `typescript-eslint`, `svelte-check`, `@sveltejs/kit`의 peer 범위 밖입니다.
  - `prisma`/`@prisma/*` 7.10.x — npm `latest` 태그가 8.0.0-rc(프리릴리스)를 가리킵니다. 8 정식 릴리스 후 올립니다.
- 워크스페이스 내부 의존성은 `workspace:*` 입니다.

## 5. 플러그인 시스템

### 5.1 플러그인 작성

```ts
import { definePlugin } from '@cms/sdk/plugin';

export const plugin = definePlugin({
  manifest: {
    id: 'my-plugin', // kebab-case, 최대 64자, 전역 유일
    name: 'My plugin',
    version: '1.0.0',
    description: '…',
    settings: [
      { key: 'greeting', label: 'Greeting', type: 'text', default: 'Hi' },
    ],
  },
  activate({ hooks, slots, routes, settings, storage, content, logger }) {
    hooks.on('content.published', (entry) =>
      logger.info(`published ${entry.slug}`),
    );
    hooks.filter('content.public', (item) => ({
      ...item,
      meta: { ...item.meta, myPlugin: true },
    }));
    slots.provide(
      'site.footer',
      async () => `<p>${await settings.get('greeting')}</p>`,
    );
    routes.add({
      method: 'GET',
      path: '/ping',
      access: 'public',
      handler: () => Response.json('pong'),
    });
  },
  deactivate() {
    /* 컨텍스트가 추적하지 않는 자원(타이머 등)만 정리 */
  },
});
```

- 번들은 `plugin` 이라는 **named export** 를 가진 단일 ES 모듈입니다: `bun build src/index.ts --target=bun --format=esm --outfile=dist/<id>.js`.
- 모듈 최상위에서 부수효과 금지. 모든 등록은 `activate` 안에서 합니다.
- HTML을 반환할 때 사용자 입력·설정 값은 **반드시 이스케이프** 하세요. 테마의 CSS 클래스(Tailwind 등)에 의존하지 말고 자체 클래스/인라인 스타일을 쓰세요.
- 예제: `plugins/reading-time` (필터 + 슬롯 + 설정).

### 5.2 확장 지점 (전부 범용)

| 능력    | API                                    | 설명                                                                                  |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| 액션 훅 | `hooks.on(name, handler)`              | `content.created/updated/published/deleted`, `site.updated`. 결과에 영향 없음         |
| 필터 훅 | `hooks.filter(name, handler, prio?)`   | `content.beforeSave`(저장 직전), `content.public`(공개 API 응답 직전). 낮은 prio 먼저 |
| 슬롯    | `slots.provide(slot, renderer)`        | `head`, `site.header`, `site.footer`, `content.before`, `content.after` 에 HTML 주입  |
| 라우트  | `routes.add({ method, path, access })` | `/api/plugins/<id><path>` 에 마운트. `access: 'admin'` 은 세션 필요                   |
| 설정    | `settings.get/all`                     | manifest 의 `settings` 필드 값(기본값 적용). 관리자 화면이 자동으로 폼을 만듭니다     |
| 저장소  | `storage.get/set/delete/keys`          | 플러그인 전용 JSON KV. 플러그인 삭제 시 함께 삭제                                     |
| 콘텐츠  | `content.list/getBySlug`               | 발행된 콘텐츠 읽기 전용(필터 미적용)                                                  |
| 로거    | `logger.info/warn/error`               | `[plugin:<id>]` 접두사                                                                |

타입 정의: `packages/sdk/src/plugin.ts`. 새 훅/슬롯은 `ActionHookMap`/`FilterHookMap`/`SLOT_NAMES`에 범용 이름으로 추가하고, 코어에서 발행 지점을 만들고, 이 표와 테스트를 갱신합니다.

### 5.3 수명주기 (관리자 화면에서 실시간)

```
업로드(install) → inactive ──enable──▶ active ──disable──▶ inactive ──remove──▶ (삭제)
                         ╲ 실패 시 failed (error 메시지 노출, 코어는 계속 동작)
```

- 같은 id로 다시 업로드하면 **업그레이드**이며 이전 enabled 상태·설정·KV를 유지합니다. 순서는 다음과 같습니다.
  1. 새 번들을 이전 번들 **옆에** 커밋합니다(이전 번들은 아직 지우지 않음).
  2. 상태를 저장합니다(`state.save`).
  3. 이전 버전을 비활성화합니다.
  4. 어디에서도 참조하지 않는 오래된 번들을 정리합니다.
  5. 새 버전을 활성화합니다.
- 상태 저장 중 DB 오류가 나면 결과가 확정되지 않을 수 있습니다(커밋 여부가 모호한 경우). 저장이 예외로 끝나면 이전·새 번들을 모두 보존하고 롤백이 이루어졌다고 가정하지 않습니다. 기존 런타임은 재시작 또는 재시도 전까지 유지되며, DB 항목은 항상 존재하는 번들을 가리킵니다. 남은 번들은 다음 업그레이드 성공 또는 삭제 때 정리됩니다.
- 상태는 `plugins` 테이블, 번들은 `PLUGINS_DIR/<id>/<uuid>.js` (업로드마다 새 파일명 → 캐시 없이 새 모듈 로드).
- 서버 재시작 시 `PluginHost.boot()`가 설치된 플러그인을 다시 로드하고 enabled 인 것을 활성화합니다. 로드 실패한 번들은 `failed`로 표시되고 나머지는 정상 부팅됩니다.
- 수명주기 명령은 `PluginHost` 안에서 직렬화됩니다(동시 요청 경합 없음).

### 5.4 격리 보장 (코어를 방해하지 않기 위한 장치)

1. 모든 플러그인 호출(import, activate, deactivate, 훅, 슬롯, 라우트)은 `shared/isolate.ts`로 감싸져 **예외를 삼키고 `PLUGIN_TIMEOUT_MS`(기본 3초) 후 포기**합니다.
2. 훅 핸들러는 값의 **복사본**(`structuredClone`)을 받으므로 코어 객체를 변조할 수 없습니다.
3. 필터 결과는 코어가 검증합니다. 잘못된 값은 버리고 이전 값을 유지합니다.
4. 액션 훅은 기다리지 않습니다(fire-and-forget). 느린 플러그인이 응답을 늦추지 않습니다.
5. 활성화 중 등록된 모든 것은 `PluginScope`가 추적하고, 비활성화/삭제/활성화 실패 시 한 번에 해제합니다. 해제 후 늦게 시도한 등록(남은 타이머 등)은 거부됩니다.
6. 비활성 플러그인의 라우트는 404, 실패한 라우트는 502 입니다. 슬롯 API 실패 시 웹은 빈 슬롯으로 렌더링합니다.
7. 플러그인 데이터(설정·KV)는 `plugin_data`에 격리되며 `ON DELETE CASCADE`로 함께 삭제됩니다.

알려진 한계: 동기 무한 루프는 이벤트 루프를 막습니다(Worker 격리 필요 시 `isolate`를 교체). ES 모듈은 메모리에서 언로드되지 않습니다(등록은 모두 해제되므로 동작에는 영향 없음). **플러그인 업로드 = 서버에서 임의 코드 실행**입니다. 관리자만 가능하며, 신뢰하는 번들만 설치해야 합니다.

## 6. 프론트엔드 규약

`apps/web`(그리고 앞으로 만들 모든 프론트엔드/테마)가 지켜야 할 규칙입니다.

1. **API로만 통신**: `@cms/sdk/client`의 클라이언트만 사용합니다. DB, `@cms/api`, 플러그인 코드 import 금지.
2. **서버에서만 호출**: API 호출은 `+page.server.ts`/`+layout.server.ts`/form action/`hooks.server.ts`에서만 합니다. 브라우저는 API 주소나 토큰을 모릅니다.
3. **세션**: 로그인 시 받은 토큰을 httpOnly 쿠키(`cms_session`)에 저장하고 `Authorization: Bearer`로 전달합니다. `/admin` 보호는 `hooks.server.ts` 한 곳에서 합니다.
4. **슬롯 렌더링 의무**: 모든 테마는 `SLOT_NAMES`의 **모든 슬롯**을 정해진 위치에 렌더링해야 합니다 — `head`(문서 head), `site.header`(헤더 끝), `site.footer`(푸터), `content.before`/`content.after`(본문 앞/뒤). `GET /api/v1/slots?path=&contentId=`로 받고 `SlotOutlet`으로 출력합니다. 슬롯 조회 실패는 빈 슬롯으로 처리합니다(`loadSlots`).
5. **플러그인을 모름**: 프론트는 특정 플러그인의 존재를 가정하지 않습니다. 플러그인 효과는 슬롯 HTML, 필터된 콘텐츠(`html`, `meta`), 관리자 화면의 범용 설정 폼으로만 나타납니다. `meta`는 어떤 형태든 견딥니다.
6. **콘텐츠 HTML**: `PublicContent.html`은 API가 스키마 검증 후 렌더링한 것이므로 그대로 `{@html}` 합니다. 프론트에서 Tiptap JSON을 직접 렌더링하지 않습니다.
7. **에디터 스키마**: 관리자 에디터는 반드시 `@cms/content`의 `contentExtensions`를 사용합니다. 확장을 추가하면 API 렌더러에도 자동 반영됩니다(같은 목록).
8. **폼 검증**: 가능하면 `@cms/sdk`의 같은 zod 스키마로 먼저 검증하고, API의 `CmsApiError`(4xx)는 `failFrom`으로 폼 오류로 변환합니다.
9. 슬러그 `admin`은 관리자 경로와 겹치므로 공개 콘텐츠에 쓰지 않습니다.
10. **사용자용 문구**: 화면·도움말·알림에서 제품 내부 동작이나 구현·개발 환경을 해명하는 문구를 쓰지 마세요. 예를 들어 “Docker 내부 값”, “개발용 기본값”, “설정 파일을 직접 편집할 필요 없음” 같은 설명은 노출하지 않습니다. 사용자가 입력하거나 수행할 일, 결과, 오류 해결에 필요한 안내만 간결하게 제공합니다. 개발·운영 세부사항은 개발자 문서에 둡니다.

## 7. HTTP API

모든 오류 응답: `{ "error": { "code", "message", "issues?" } }`.

| 메서드 | 경로                                       | 인증     | 설명                                          |
| ------ | ------------------------------------------ | -------- | --------------------------------------------- |
| GET    | `/api/health`                              |          | 상태 확인                                     |
| GET    | `/api/v1/site`                             |          | 사이트 설정                                   |
| GET    | `/api/v1/content?type&page&pageSize`       |          | 발행 콘텐츠 목록 (`content.public` 필터 적용) |
| GET    | `/api/v1/content/:slug`                    |          | 발행 콘텐츠 1건                               |
| GET    | `/api/v1/slots?path&contentId`             |          | 슬롯 HTML                                     |
| GET    | `/api/v1/auth/status`                      |          | `{ setupRequired }`                           |
| GET    | `/api/v1/install/status`                   |          | `{ databaseConfigured, setupRequired }`       |
| POST   | `/api/v1/install/database`                 | 설치 키  | DB 검증·마이그레이션·접속 설정 저장           |
| POST   | `/api/v1/install/complete`                 | 설치 키  | 사이트·첫 관리자·세션을 원자적으로 생성       |
| POST   | `/api/v1/auth/login` · `/logout`           |          | 세션 발급/폐기                                |
| GET    | `/api/v1/auth/me`                          | ✔        | 현재 사용자                                   |
| GET    | `/api/v1/auth/sso`                         |          | SSO 사용 가능 여부와 표시 이름                |
| POST   | `/api/v1/auth/sso/start`                   | 선택     | SSO 로그인/연결 시작 (연결은 로그인 필요)     |
| POST   | `/api/v1/auth/sso/callback`                | 선택     | 제공자 응답 검증 후 세션 발급 또는 연결 완료  |
| GET    | `/api/v1/auth/sso/identity`                | ✔        | 현재 사용자의 SSO 연결·운영자 할당 상태       |
| DELETE | `/api/v1/auth/sso/identity`                | ✔        | 현재 사용자의 SSO 연결 해제                   |
| CRUD   | `/api/v1/admin/content[/:id]`              | ✔        | 모든 상태의 콘텐츠                            |
| PUT    | `/api/v1/admin/site`                       | ✔        | 사이트 설정 저장                              |
| GET    | `/api/v1/admin/plugins`                    | ✔        | 플러그인 목록                                 |
| POST   | `/api/v1/admin/plugins`                    | ✔        | 번들 업로드(본문 = JS 소스) 설치/업그레이드   |
| POST   | `/api/v1/admin/plugins/:id/enable·disable` | ✔        | 활성화/비활성화                               |
| PUT    | `/api/v1/admin/plugins/:id/settings`       | ✔        | 설정 저장 (manifest 기준 검증)                |
| DELETE | `/api/v1/admin/plugins/:id`                | ✔        | 삭제 (번들·설정·KV 포함)                      |
| \*     | `/api/plugins/:id/*`                       | 라우트별 | 플러그인 라우트 게이트웨이                    |

### 7.1 API 라우팅 규약 (ElysiaJS, 파일 기반)

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
- **서버 시작/종료**: `createBootstrap`이 돌려주는 `app`(Elysia)을 `main.ts`가 `app.listen({ port, maxRequestBodySize })`로 시작하고 `app.stop()`으로 끝냅니다.
- **Elysia 업스트림 가정**: 요청 URL에서 경로 시작(`/`)을 11번째 문자 이후에서 찾습니다(`indexOf("/", 11)`). `http://` + 호스트가 3자 이하이고 포트가 없는 URL(`http://api/…`)은 모든 경로가 404가 되므로 그런 호스트명으로 API를 노출하지 마세요. 테스트는 `http://localhost/...`를 씁니다.

### 7.2 SSO (OpenID Connect)

OIDC Authorization Code + PKCE를 사용하며, 환경변수(`apps/api/.env.example`)로 켭니다. `OIDC_ISSUER`(https), `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`가 **모두** 설정돼야 켜지고, 일부만 있으면 시작 시 설정 오류입니다. 비밀 값은 API 서버에만 있습니다.

| 변수                                | 설명                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `OIDC_ISSUER`                       | 제공자 issuer (https, 쿼리 없음)                                                      |
| `OIDC_CLIENT_ID`                    | 클라이언트 ID                                                                         |
| `OIDC_REDIRECT_URI`                 | 웹 앱의 `/admin/sso/callback` URL (제공자에 등록)                                     |
| `OIDC_CLIENT_SECRET`                | 클라이언트 비밀. `OIDC_CLIENT_AUTH_METHOD`가 `none`이 아니면 필수                     |
| `OIDC_CLIENT_AUTH_METHOD`           | `client_secret_basic`(비밀이 있을 때 기본) · `client_secret_post` · `none`(PKCE만)    |
| `OIDC_SCOPES`                       | 공백 구분, 기본 `openid` (반드시 포함)                                                |
| `OIDC_NAME`                         | 로그인 버튼 표시 이름 (기본 `SSO`, 최대 64자)                                         |
| `OIDC_ALLOWED_SUBJECTS`             | JSON `{ "<subject>": "<기존 관리자 이메일>" }` — 연결 없이 로그인할 수 있는 주체 목록 |
| `OIDC_FRONTEND_SECRET`              | SSO를 켜면 필수(32자 이상). **API와 웹 서버에 같은 값**으로 설정. 방문자 주소 증명용  |
| `OIDC_MAX_PENDING_REQUESTS`         | 대기 중 인증 요청 수 전체 상한. 기본 1000, 범위 1–100000                              |
| `OIDC_MAX_PENDING_PER_CLIENT`       | 클라이언트 하나의 대기 요청 상한. 기본 10, 전체 상한 이하                             |
| `OIDC_STARTS_PER_MINUTE`            | 분당 SSO 시작 수 전체 상한(**API 프로세스마다**). 기본 300                            |
| `OIDC_STARTS_PER_MINUTE_PER_CLIENT` | 클라이언트 하나의 분당 SSO 시작 수(프로세스마다). 기본 10, 전체 이하                  |

- 계정은 **제공자의 이메일 클레임으로 절대 자동 연결하지 않습니다.** 기존 사용자와의 연결은 로그인한 상태에서 `start`(연결) → `callback`으로 명시적으로 `issuer`+`subject`를 묶거나, `OIDC_ALLOWED_SUBJECTS`에 운영자가 직접 등록한 주체만 가능합니다. 비밀번호 로그인은 SSO와 함께 계속 동작합니다.
- 인증 상태(`state`, `nonce`, PKCE verifier)는 서버의 `sso_transactions`에만 있으며 1회용이고 10분 뒤 만료됩니다. 브라우저에는 핸들만 전달됩니다.
- **정확한 식별자 비교**: `issuer`·`subject`는 `user_identities`에 UTF-8 바이트(`VARBINARY(255)`)로 저장되고 유일 인덱스도 바이트 단위입니다. 대소문자 접기·정규화·후행 공백 무시가 없으므로 `Alice`와 `alice`는 다른 계정입니다. 도메인은 조회 결과의 값이 검증된 값과 정확히 같을 때만 받아들이고, 올바른 유니코드가 아니거나 255바이트를 넘는 값은 거부합니다. 이 컬럼을 텍스트 콜레이션으로 바꾸지 마세요.
- **세션 폐기**: 연결(`user_identities`)마다 불변 `id`가 있고, 연결을 통해 발급한 세션은 `sessions.identity_id`(FK, `ON DELETE CASCADE`)로 묶입니다. 연결 해제나 다른 계정으로 교체하면 DB가 같은 문장에서 그 세션들을 지웁니다. 해제와 경합한 로그인은 FK 위반으로 거부되어(401) 세션이 남지 않습니다. 비밀번호 세션은 영향받지 않습니다. 관리자 Account 화면에서 연결·해제할 수 있습니다.
- 운영자 할당(`OIDC_ALLOWED_SUBJECTS`)으로 로그인한 세션은 연결에 묶이지 않습니다. 할당을 지우고 재시작하면 새 로그인은 막히지만, 기존 세션은 만료(`SESSION_TTL_HOURS`)나 로그아웃까지 유지됩니다.
- **시작 속도 제한(먼저 검사)**: `start`는 제공자 호출·DB 접근 전에 `RateLimiter`(`domain/ports.ts`)로 클라이언트별·전체 속도를 동기적으로 예약합니다. 초과하면 429 `rate_limited`이며 그 요청은 아무 작업도 하지 않습니다. 구현 `infra/memory-rate-limiter.ts`는 프로세스 메모리의 토큰 버킷(창 60초)이라 **API 인스턴스마다 따로** 셉니다. 인스턴스가 N개면 실제 허용량은 최대 N배이고, 재시작하면 초기화됩니다. 키는 허용된 시도 뒤에만 기억하고 마지막 허용 후 한 창이 지나면 잊으므로, 기억하는 키는 최대 전체 한도의 2배입니다.
- **요청 등록 상한(프로세스 간)**: 속도 제한을 통과한 등록은 DB 트랜잭션과 공통 행 잠금(`settings`의 `sso.admission`)으로 직렬화해 모든 인스턴스를 합쳐 전체 상한과 클라이언트별 상한을 함께 지킵니다. 만료 요청은 다음 등록 시 정리합니다. 상한에 도달하면 SSO 시작만 409로 거부되고 비밀번호 로그인은 유지됩니다.
- **클라이언트 식별**: API는 웹 서버만 보므로 방문자 주소는 웹 서버가 증명합니다. 웹은 SSO 로그인 시작 요청에만 `getClientAddress()`(adapter-node의 프록시 설정 `ADDRESS_HEADER`/`XFF_DEPTH`를 따름)와 `OIDC_FRONTEND_SECRET`을 `x-cms-client-address`/`x-cms-frontend-secret` 헤더로 보냅니다. API는 비밀이 일치할 때만(상수 시간 비교) 주소를 믿고 IPv4 주소 또는 IPv6 /64 단위로 셉니다. 비밀이 없거나 틀린 요청(API 직접 호출 포함)은 주장한 주소와 무관하게 하나의 공용 할당량과 속도를 나눠 씁니다. 연결 요청은 사용자 단위로 셉니다. 속도 제한과 등록 상한은 같은 클라이언트 키를 씁니다. 여러 주소를 가진 공격자는 전체 상한까지 채울 수 있습니다.
- 라우트 파일: `http/routes/api/v1/auth/sso/{index,start,callback,identity}.ts`, 서비스: `domain/auth/sso-service.ts`, 클라이언트 식별: `http/sso-client.ts`.
- 마이그레이션 `20261023000000_sso_exact_identity_sessions`는 적용 시 **모든 세션과 대기 중 SSO 요청을 삭제**합니다(모두 다시 로그인). 계정·연결·콘텐츠·플러그인은 유지됩니다. 적용 전에 DB를 백업하세요.

### 7.3 HTML·CSS·JS minify

프로덕션 HTML은 `@swc/html`로, 브라우저 JS·CSS는 Vite의 Oxc·Lightning CSS로 압축합니다. HTML 변환은 요청별로 조각을 모아 완성된 문서를 처리합니다. Svelte hydration 주석과 본문 공백을 보존하며, 파싱 오류가 있는 문서는 변경하지 않습니다.

SWC는 `<title>` 내부 공백을 축약합니다. 표시 제목과 hydration은 유지되지만 `title.textContent`는 달라질 수 있습니다. 인라인 스크립트도 압축되므로 hash 기반 CSP를 도입할 때는 최종 출력 기준으로 해시를 계산해야 합니다.

## 8. 데이터베이스

- 스키마: `apps/api/prisma/schema.prisma`. 클라이언트는 `src/infra/prisma/generated`로 생성됩니다(커밋하지 않음).
- 스키마 변경: `bun run --filter @cms/api db:migrate:dev -- --name <설명>` → 생성된 SQL 검토 → 커밋. 배포 시 `db:migrate`.
- Prisma 사용은 `apps/api/src/infra/` 안에서만 합니다. 도메인으로 Prisma 타입을 노출하지 마세요(레코드 타입은 포트에 정의).
- 테이블: `users`, `user_identities`(SSO 연결), `sso_transactions`(진행 중인 SSO 요청), `sessions`, `contents`, `settings`, `plugins`, `plugin_data`.
- 플러그인을 위한 테이블/컬럼 추가 금지. 플러그인 데이터는 `plugin_data`(settings/kv)만 씁니다.

## 9. 테스트

- `bun test` (루트). 테스트는 각 패키지의 `test/` 또는 `*.test.ts`.
- 도메인·플러그인 런타임은 `apps/api/test/support`의 인메모리 어댑터와 `createRuntime()`으로 DB 없이 테스트합니다. 새 포트를 만들면 인메모리 구현도 같은 계약으로 추가합니다.
- 플러그인 관련 변경은 **비활성화·삭제·실패 시 코어가 원래대로 동작함**을 검증하는 테스트를 반드시 포함합니다(`plugin-host.test.ts` 참고).
- Prisma 어댑터는 실제 MariaDB가 필요합니다. SSO 어댑터와 마이그레이션은 `CMS_TEST_DATABASE_URL`(DB 생성 권한이 있는 서버 계정)을 설정했을 때만 `apps/api/test/sso-prisma.test.ts`가 검증합니다. 이 테스트는 `cms_sso_test_<uuid>` DB를 새로 만들어 마이그레이션을 적용하고 끝나면 지웁니다. URL에 적힌 DB는 쓰지 않습니다. 설정하지 않으면 건너뜁니다.

## 10. 작업 체크리스트

- [ ] 새 책임은 새 모듈로 분리했다 (SRP). 구체 구현은 `infra/`와 `container.ts`에만 있다 (DIP).
- [ ] 코어가 특정 플러그인을 알지 못한다. 새 확장 지점은 범용이다.
- [ ] 플러그인이 꺼지거나 실패해도 코어가 동작함을 테스트했다.
- [ ] 신뢰 경계 입력을 검증했다.
- [ ] named import/export, `import type` 을 지켰다.
- [ ] 새 의존성은 최신 안정 버전이며 `bun add`로 추가했다.
- [ ] `bun run check` 가 통과한다.
- [ ] API·확장 지점·규약이 바뀌면 이 문서를 갱신했다.
