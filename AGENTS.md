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
| DB        | MariaDB (원본 데이터, 검색 폴백 포함)                                           |
| 검색      | MariaDB `FULLTEXT` 기본, Meilisearch 선택 (가속기일 뿐, 원본 아님)              |
| Web       | SvelteKit 3 (Svelte 5 runes), adapter-node, Tailwind 4, shadcn-svelte (bits-ui) |
| 에디터    | Tiptap 3 (스키마는 `@cms/content` 하나로 공유)                                  |
| 검증      | zod 4 (스키마는 `@cms/sdk`에서 공유)                                            |
| 품질      | ESLint 10 (flat config) + Prettier 3                                            |

## 2. 빠른 시작

```bash
bun install
docker compose up -d                          # MariaDB (또는 기존 MariaDB 사용)
bun run --filter @cms/api db:generate         # Prisma Client 생성 (src/infra/prisma/generated)
bun run dev                                   # API :4000 + Web :5173(WEB_PORT 있으면 그 포트) → 첫 설치 마법사
```

API와 웹은 병렬로 실행됩니다. 개별 실행은 `bun run dev:api`, `bun run dev:web`을 사용합니다.

운영 실행은 루트의 `ecosystem.config.cjs`(pm2)를 씁니다: `bun install` → `bun run --filter @cms/api db:generate` → `bun run --filter @cms/web build` → `pm2 start ecosystem.config.cjs` (API :4000, 웹 :3000, 둘 다 기본 `127.0.0.1`에서만 수신 — 앞에 https 리버스 프록시를 둡니다). `.env`는 필요 없습니다.

웹 빌드는 `../board`처럼 **릴리스로 승격**합니다. `bun run --filter @cms/web build`는 `vite build` 뒤에 `apps/web/scripts/release.js`를 실행해 `build/`를 `apps/web/.web-releases/<내용 해시>/`로 복사하고 `.active-web-release`가 그것을 가리키게 합니다. `server.js`는 활성 릴리스에서 시작하므로, 다시 빌드해도 실행 중인 서버의 파일은 바뀌지 않습니다(새 릴리스는 `pm2 restart cms-web`부터). 12시간 안에 물러난 릴리스의 해시된 브라우저 에셋은 남아 있는 릴리스에 하드 링크로 이어 붙여 이미 열린 페이지도 스크립트를 불러오고, 그보다 오래된 릴리스는 다음 승격 때 지웁니다. 압축(.br/.gz)은 만들지 않습니다(리버스 프록시가 압축). `server.js`는 `X-Forwarded-Proto`가 없는 직접 연결에 실제 스킴을 채워, http로 접속해도 폼 전송이 CSRF 검사(403)에 막히지 않습니다. 리버스 프록시는 `X-Forwarded-Proto`를 넘겨야 합니다.

**`.env`는 루트 하나만 씁니다**(`.env.example` 참고, 앱별 `.env` 없음). API·웹 실행 스크립트와 pm2는 `bun --env-file=../../.env`, 웹 개발 서버와 SvelteKit은 `env.dir`, Prisma CLI는 `prisma.config.ts`가 이 파일을 읽으며, 이미 설정된 환경변수가 우선합니다. 두 서버가 같은 파일을 읽으므로 포트·주소는 `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`로 나눕니다. 웹은 `CMS_API_URL`이 없으면 `http://127.0.0.1:<API_PORT>`로 API를 찾습니다.

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

**`.env` 없이 운영할 수 있어야 합니다(WordPress의 `wp-config.php`처럼 선택 사항).** 사이트 운영에 필요한 설정은 모두 관리자 화면에 있습니다: DB 접속(설치 마법사), 메일, 캡챠·속도 제한, 싱글 사인온, Meilisearch, 페이지 캐시(설정 → 읽기) 등. 새 설정을 추가할 때도 env 전용으로 만들지 말고 `settings`에 저장하는 관리자 설정으로 만듭니다(비밀 값은 `SecretBox`로 봉인). 환경변수는 기본값을 바꾸는 **선택적 재정의**로만 둡니다.

- `bun run --filter @cms/web start`(`apps/web/server.js`)는 업로드를 위해 `BODY_SIZE_LIMIT`을 기본 64MB로 두되, 훅이 일반 폼 64KB·콘텐츠 2MB·플러그인 6MB·WXR 17MB로 먼저 제한합니다. API JSON은 기본 512KB(공개 인증·댓글 32KB, 콘텐츠 1MB), WXR은 16MB입니다.
- 웹 시작 시 루트 `.env`를 읽은 뒤 DB 주소·API 비밀 키·OIDC 클라이언트 비밀 같은 API 전용 변수를 제거하고 앱을 불러옵니다. 웹 런타임에는 `WEB_*`, `CMS_API_URL`, 방문자 증명 비밀 등 필요한 값만 남아야 합니다.
- 비밀 키는 자동입니다. `CMS_SECRET_KEY`가 없으면 `apps/api/data/secret.key`를 만들어 씁니다(DB와 함께 백업; API 인스턴스가 여러 개면 같은 값을 공유).
- 웹↔API 방문자 증명 비밀은 비밀 키에서 파생되며, 관리자가 로그인하면 웹 서버가 `GET /api/v1/admin/frontend-secret`으로 받아 `apps/web/data/frontend.secret`(0600)에 보관합니다. 그 전까지 방문자는 공용 할당량을 나눠 씁니다. 두 서버에 같은 `CMS_FRONTEND_SECRET`(32자 이상)을 두면 이 과정을 건너뜁니다.
- 선택적 재정의(루트 `.env.example`): `DATABASE_URL`, `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`, `CMS_API_URL`, `MEDIA_DIR`/`PLUGINS_DIR`(인스턴스가 여러 개면 공유 저장소), `MEDIA_MAX_MB`, `SESSION_TTL_HOURS`, `PLUGIN_TIMEOUT_MS`, `SCHEDULER_INTERVAL_MS`, `OIDC_*`(서버에서 SSO를 고정할 때; 있으면 관리자 SSO 설정보다 우선).

변경을 마치기 전에 **반드시** 루트에서 실행합니다.

```bash
bun run check   # prettier --check → eslint → 모든 패키지 typecheck → bun test
```

## 3. 저장소 구조

```
packages/
  sdk/        @cms/sdk      공유 계약: DTO·zod 스키마(index), 플러그인 API(plugin), HTTP 클라이언트(client)
  content/    @cms/content  Tiptap 확장 목록(에디터·렌더러 공용), 서버 렌더러(render), 서버 전용 HTML→문서 변환(parse)
apps/
  api/        @cms/api      코어 백엔드
    prisma/                 schema.prisma, migrations/
    src/
      shared/               도메인 무관 유틸: errors, validation, isolate, logger
      domain/               유스케이스와 포트(인터페이스). content/, auth/, users/, site/, taxonomy/, permalinks/, seo/,
                            media/, comments/, search/, appearance/(메뉴·위젯), theme/, jobs/(스케줄러·잡), security/(속도 제한·캡챠),
                            email/, webhooks/, tools/(사이트 상태·WXR 가져오기/내보내기), ports.ts
      plugin-runtime/       플러그인 수명주기·확장 지점: hook-bus, slot-registry, widget-registry, embed-registry,
                            admin-page-registry, route-registry(선언만 보관), plugin-host …
      infra/                어댑터: prisma/, plugins/(파일시스템·동적 import), meilisearch-engine, wxr-parser, smtp-mailer,
                            captcha-verifier, sharp-images, fs-media-storage, webhook-transport, secret-box, system.ts
      http/                 app.ts(createApiApp·createInstallerApp, 오류 매핑), services.ts(DI 타입), session.ts(인증 가드), plugin-gateway.ts, request/respond, routes/{api,install}/** (파일 경로 = URL)
      container.ts          컴포지션 루트 — 구현체를 아는 유일한 파일
      main.ts               부트스트랩
    test/                   bun test, test/support 의 인메모리 어댑터
  web/        @cms/web      SvelteKit 앱
    src/routes/(site)/      공개 테마
    src/routes/admin/       관리자 ((auth): 로그인·셋업, (app): 인증 필요)
    src/lib/server/         API 클라이언트 생성, 세션, 폼 파싱 (서버 전용)
    src/lib/admin/          관리자 컴포넌트 (Editor, ContentForm, PluginSettingsForm …)
    src/lib/theme/          블록 테마 렌더러: TemplateView(템플릿 계층), blocks/(블록별 컴포넌트), AdminBar, SlotOutlet, WidgetArea, Comments …
    src/lib/i18n/           관리자·테마 문구 카탈로그(en, ko). 화면 문구는 모두 여기서 가져옵니다
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
- **변수·함수명은 설명문처럼 짓지 않습니다.** `adminRequiredForAuthorizedTasks`처럼 조건·목적·행동을 문장으로 나열하지 말고 `requireAdmin`, `isPublished`, `permalinks`처럼 맥락에 맞는 짧고 정확한 도메인 명사·동사를 사용합니다. 모듈·클래스가 이미 알려주는 맥락을 이름에 반복하지 않으며, 긴 설명은 주석이나 타입으로 옮깁니다. 글자 수만 줄이는 불명확한 약어도 금지합니다. 기존 코드 수정 시에도 이 원칙을 적용하고 모든 참조를 함께 고칩니다. Public/Admin DTO 구분 등 필요한 계약 의미는 유지하며, 외부 라이브러리 옵션·표준 필드명은 임의로 바꾸지 않습니다.
- **프로젝트 내부 모듈은 반드시 named path alias로 import/re-export 합니다.** `../../../../`를 비롯한 모든 `../`·`./` 상대 모듈 경로를 금지합니다. API는 `#api/<src 기준 경로>`, API 테스트는 `#test/<test 기준 경로>`, SDK는 `#sdk/*`, 콘텐츠 패키지는 `#content/*`, 웹은 `#lib/*` 또는 `#web/*`, 예제 플러그인 내부는 `#plugin/*`를 사용합니다. `package.json`의 `imports`가 런타임과 TypeScript 모두에서 같은 경로를 해석해야 하며, 타입 전용·동적 import에도 적용합니다. 유일한 모듈 예외는 SvelteKit이 생성하는 `./$types`입니다. `tsconfig`의 `extends`, 파일시스템 경로, URL은 모듈 import가 아니므로 대상이 아닙니다. 패키지 간에는 기존 공개 `@cms/*` 계약만 사용하고 alias로 아키텍처 경계를 우회하지 않습니다. ESLint가 상대 import/re-export와 경계 위반을 차단합니다.
- 웹 테스트와 테스트 픽스처에는 `#web-test/*`를 사용합니다. 테스트 때문에 상대 import 예외를 추가하지 않습니다.
- **Public DTO/Admin DTO 분리는 필수입니다.** DB 레코드·설정·사용자 객체를 그대로 반환하거나 펼쳐서 SvelteKit load/action 데이터에 넣지 않습니다. 공개/관리자 DTO의 허용 필드를 각각 명시적으로 매핑하고 SDK 런타임 스키마로 검증합니다. 비밀번호·해시·토큰·DB 접속 정보·SSO 비밀 값은 어느 화면의 직렬화 데이터에도 포함하지 않습니다. 공개 DTO에 초안·에디터 문서·관리자 식별 정보가 섞이지 않도록 회귀 테스트를 유지합니다. 오류 상세도 `{ path, message }`만 전달하며 플러그인 예외 원문은 서버 로그에만 남깁니다(6.1절).
- Prettier: 2-space, LF, singleQuote, trailingComma `all` (`.prettierrc`, `.editorconfig`, `.gitattributes`).
- 신뢰 경계(HTTP 입력, 폼 입력, 플러그인 반환값, 업로드된 번들)에서는 **반드시** zod 등으로 검증합니다. 공유 스키마는 `@cms/sdk`에 둡니다.
- 예상된 실패는 `DomainError`(`invalid_input`/`unauthorized`/`not_found`/`conflict`/`rate_limited`(429))로 던집니다. HTTP 상태 매핑은 `http/respond.ts` 한 곳에만 있습니다.
- **오류 메시지는 반드시 패키지의 `Errors` 카탈로그에서 가져옵니다.** `throw new Error(Errors.ContentPathMissing)`, `throw notFound(Errors.ContentNotFound)`, `conflict(Errors.SlugInUse(slug))`처럼 씁니다. 세부 값이 필요한 메시지는 카탈로그에 함수로 둡니다. 카탈로그는 API `#api/shared/errors`, SDK `#sdk/errors`, 콘텐츠 `#content/errors`, 웹 `#lib/server/errors.js`에 있습니다. 소스 코드(`apps/*/src`, `packages/*/src`)에서 `new *Error(...)`, `DomainError` 팩토리, `guardUnique`, `errorResponse`, SvelteKit `error()`에 문자열·템플릿 리터럴 메시지를 넘기거나 리터럴을 `throw`하면 ESLint가 막습니다. 테스트와 픽스처는 예외입니다.
- 웹 앱에서 `#lib/...` 경로는 `.js` 확장자를 붙입니다(`#lib/server/api.js`). 링크는 `resolve()`(`$app/paths`)로 만듭니다.

### 4.4 패키지와 버전

- 패키지 관리자와 런타임은 **Bun만** 씁니다. `bun add`, `bun remove`, `bun update --latest`, `bunx`.
- 의존성은 **확인 가능한 최신 안정 버전**을 유지합니다. 추가·갱신 시 `npm view <pkg> version`/`bun outdated`로 확인합니다.
- 현재 의도적인 예외 (해제 조건이 충족되면 즉시 올리세요):
  - `typescript` 6.x — TS 7(네이티브)은 `typescript-eslint`, `svelte-check`, `@sveltejs/kit`의 peer 범위 밖입니다.
  - `prisma`/`@prisma/*` 7.10.x — npm `latest` 태그가 8.0.0-rc(프리릴리스)를 가리킵니다. 8 정식 릴리스 후 올립니다.
  - `happy-dom` 20.x — `@tiptap/html`(서버 HTML→문서 변환)의 peer 범위가 `^20`입니다. tiptap이 21을 허용하면 올립니다.
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

| 능력      | API                                                          | 설명                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 액션 훅   | `hooks.on(name, handler)`                                    | `content.created/updated/published/trashed/restored/deleted`, `media.uploaded/deleted`, `comment.created/statusChanged`, `site.updated`. 결과에 영향 없음                                                                                |
| 필터 훅   | `hooks.filter(name, handler, prio?)`                         | `content.beforeSave`(저장 직전), `content.public`(공개 API 단건 응답 직전, 본문 포함), `content.publicSummary`(공개 목록 항목 응답 직전, 본문 없음), `comment.beforeSave`(방문자 댓글 저장 직전; `body`·`status`만 반영). 낮은 prio 먼저 |
| 슬롯      | `slots.provide(slot, renderer)`                              | `head`, `site.header`, `site.footer`, `content.before`, `content.after`, `comments.before`, `comments.after` 에 HTML 주입                                                                                                                |
| 위젯      | `widgets.provide(key, { name, render })`                     | 위젯 유형 `plugin:<id>:<key>`. 관리자가 사이드바/푸터 영역에 배치하고 `render(settings)`의 HTML이 표시됩니다(실패 시 해당 위젯만 빠짐)                                                                                                   |
| 임베드    | `embeds.register({ name, render })`                          | 에디터 임베드 블록의 주소를 플레이어 HTML로 바꿉니다. 코어 제공자(YouTube·Vimeo)가 먼저 판단합니다                                                                                                                                       |
| 작업      | `tasks.every(name, intervalMs, task)`                        | 최소 1분 간격의 반복 작업. 코어 스케줄러가 인스턴스 하나에서만 실행합니다(`plugin:<id>:<name>`, 60초 제한)                                                                                                                               |
| 관리 화면 | `admin.page(key, { title, capability?, render, actions? })`  | 관리자 메뉴의 플러그인 페이지. `render()`는 **블록 데이터**(`heading/text/notice/stats/table/form`, `adminBlockSchema`)만 반환하며 HTML·스크립트는 받지 않습니다. 폼 값은 폼 필드 기준으로 검증된 뒤 `actions[name]`에 전달됩니다        |
| 대시보드  | `admin.dashboardWidget(key, { title, capability?, render })` | 대시보드 상자. `render()`는 표시 블록(`form` 제외)만 반환하고 다른 플러그인 호출처럼 격리·시간 제한됩니다. 실패·비활성 플러그인의 상자는 빠지며 기본 권한은 `plugins.manage`입니다                                                       |
| 라우트    | `routes.add({ method, path, access })`                       | `/api/plugins/<id><path>` 에 마운트. `access: 'admin'` 은 세션과 `plugins.manage` 권한 필요                                                                                                                                              |
| 설정      | `settings.get/all`                                           | manifest 의 `settings` 필드 값(기본값 적용). 관리자 화면이 자동으로 폼을 만듭니다                                                                                                                                                        |
| 저장소    | `storage.get/set/delete/keys`                                | 플러그인 전용 JSON KV. 플러그인 삭제 시 함께 삭제                                                                                                                                                                                        |
| 콘텐츠    | `content.list/getBySlug`                                     | 발행된 콘텐츠 읽기 전용(필터 미적용)                                                                                                                                                                                                     |
| 로거      | `logger.info/warn/error`                                     | `[plugin:<id>]` 접두사                                                                                                                                                                                                                   |

manifest의 `requires: { cms?: '<semver 범위>', plugins?: { '<id>': '<범위>' } }`가 맞지 않으면 활성화 대신 `failed`와 이유(코어 문구)를 보여 줍니다. 부팅 시 필요한 플러그인이 먼저 활성화됩니다. `updateUrl`(https, `{ "version", "download" }` 응답)을 적으면 관리자 화면에서 새 버전을 확인할 수 있습니다(자동 설치 없음).

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
- **여러 API 인스턴스**: 각 인스턴스가 10초마다 `PluginHost.reconcile()`로 `plugins` 테이블과 자신을 맞춥니다(다른 인스턴스에서 한 설치·업그레이드·켜기/끄기·삭제 반영). `PLUGINS_DIR`은 모든 인스턴스가 같은 저장소를 봐야 하며, 로드에 실패한 번들은 바뀔 때까지 `failed`로 둡니다.

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
3. **세션**: 로그인 시 받은 토큰을 httpOnly 쿠키(`cms_session`)에 저장하고 `Authorization: Bearer`로 전달합니다. `/admin` 보호는 `hooks.server.ts` 한 곳에서 합니다. 로그인하지 않은 GET 요청은 `/admin/login?redirect_to=<경로>`로 보내고, 로그인 후 `returnPath`(`#lib/server/return-path.js`)가 같은 사이트의 `/admin` 경로만 허용해 돌아갑니다(그 외는 대시보드).
4. **슬롯 렌더링 의무**: 모든 테마는 `SLOT_NAMES`의 **모든 슬롯**을 정해진 위치에 렌더링해야 합니다 — `head`(문서 head), `site.header`(헤더 끝), `site.footer`(푸터), `content.before`/`content.after`(본문 앞/뒤), `comments.before`/`comments.after`(댓글 영역 앞/뒤, 댓글 영역이 있을 때). 블록 테마에서는 코어 렌더러가 위치를 보장합니다: `site.header`/`site.footer`는 header/footer 영역 템플릿 파트 뒤(템플릿에 없으면 페이지 처음/끝), `content.*`는 `post-content` 블록, `comments.*`는 `comments` 블록이 출력합니다. `GET /api/v1/slots?path=&contentId=`로 받고 `SlotOutlet`으로 출력합니다. 슬롯 조회 실패는 빈 슬롯으로 처리합니다(`loadSlots`). 슬롯은 페이지마다 다르므로 각 페이지 load가 받습니다. `contentId`를 생략하면 API가 `path`의 현재 주소 콘텐츠를 찾으므로, 콘텐츠 페이지는 주소 조회와 슬롯을 함께 요청합니다. 공개 레이아웃 load는 `url`·`route`를 읽지 않습니다(읽으면 클라이언트 이동·링크 미리 로드 때마다 레이아웃 API 호출이 모두 다시 실행됩니다). 오류 페이지에는 슬롯이 없습니다.
5. **플러그인을 모름**: 프론트는 특정 플러그인의 존재를 가정하지 않습니다. 플러그인 효과는 슬롯 HTML, 필터된 콘텐츠(`html`, `meta`), 위젯 HTML, 관리자 화면의 범용 설정 폼과 블록 기반 플러그인 페이지로만 나타납니다. `meta`는 어떤 형태든 견딥니다.
6. **콘텐츠 HTML**: `PublicContent.html`은 API가 스키마 검증 후 렌더링한 것이므로 그대로 `{@html}` 합니다. 프론트에서 Tiptap JSON을 직접 렌더링하지 않습니다.
7. **에디터 스키마**: 관리자 에디터는 반드시 `@cms/content`의 `contentExtensions`를 사용합니다. 확장을 추가하면 API 렌더러에도 자동 반영됩니다(같은 목록).
8. **폼 검증**: 가능하면 `@cms/sdk`의 같은 zod 스키마로 먼저 검증하고, API의 `CmsApiError`(4xx)는 `failFrom`으로 폼 오류로 변환합니다.
9. 슬러그 `admin`은 관리자 경로와 겹치므로 공개 콘텐츠에 쓰지 않습니다.
10. **사용자용 문구**: 화면·도움말·알림에서 제품 내부 동작이나 구현·개발 환경을 해명하는 문구를 쓰지 마세요. 예를 들어 “Docker 내부 값”, “개발용 기본값”, “설정 파일을 직접 편집할 필요 없음” 같은 설명은 노출하지 않습니다. 사용자가 입력하거나 수행할 일, 결과, 오류 해결에 필요한 안내만 간결하게 제공합니다. 개발·운영 세부사항은 개발자 문서에 둡니다.
11. **문구 카탈로그**: 관리자·테마 화면의 문구는 `#lib/i18n`(en, ko; 같은 키·같은 매개변수)에서 가져옵니다. 폼 action은 알림으로 카탈로그 키(`{ notice: 'saved' }`)를 돌려줍니다. 공개 테마는 사이트 언어(`site.locale`), 관리자 화면은 사용자 언어(없으면 사이트 언어)를 씁니다.
12. **저장하지 않은 변경**: 편집 화면(콘텐츠·메뉴·위젯·사이트 편집기)은 `confirmLeave`(`#lib/admin/unsaved.js`)로 떠나기 전에 묻습니다. 세션이 만료된 상태의 enhance 폼 요청(`x-sveltekit-action`)에는 `hooks.server.ts`가 303 대신 `/admin/login`으로 가는 action `redirect` 결과를 돌려주므로, 콘텐츠 편집기는 이를 가로채 입력을 유지하고 다시 로그인하도록 안내합니다(본문은 `sessionStorage`에도 백업). 백업(`#lib/admin/editor-backup.js`)은 사용자 id와 글별로 저장되고 24시간 뒤 만료되며, 저장 성공·로그아웃·다른 계정 로그인 시 지워집니다. 편집기 저장은 `expectedUpdatedAt`을 보내므로 그사이 다른 사람이 저장했으면 덮어쓰지 않고 충돌을 알립니다.

### 6.1 Public and admin DTO boundaries

- `PublicContent` and `PublicContentListQuery` are separate contracts from `ContentEntry` and `ContentListQuery`. Public responses exclude editor documents, author IDs, draft status, and creation timestamps. Public lists always select published content, regardless of supplied extra query parameters. A signed-in canonical single-entry read may additionally return private content after `authorize(actor, 'content.readPrivate')`, using the same public projection and `private, no-store` caching policy.
- Lists never carry bodies. `GET /api/v1/content` returns `PublicContentSummary` (`PublicContent` without `html`), read with a projection that does not fetch the body, and passed through the `content.publicSummary` filter. The admin list returns `AdminContentSummary` (no `document`/`html`). Single reads keep the full DTOs. Plugin `content.list` still returns `PublicContent` with `html`.
- Public taxonomy DTOs expose published-content counts only. Admin taxonomy DTOs include editing timestamps and counts across publication states. Content embeds only `TermSummary` (`id`, `name`, `slug`), not full term records.
- `PublicSiteDto` contains display settings only. `AdminUserDto`/`UserProfile` and `AdminPluginDto`/`PluginInfo` belong only to authenticated admin screens. Credentials, database configuration, session grants, and SSO transactions must never be returned from SvelteKit loads or form failures.
- SDK clients validate response DTOs at runtime before SvelteKit can serialize them. Malformed responses fail with `502 invalid_response`, without embedding the rejected payload in the error. Public content and plugin filter results use strict public schemas; other allowlist schemas strip undeclared properties.
- A TypeScript return annotation is not a projection. Domain mappers and server loads must explicitly select fields; never spread database records or `locals` into page data.
- Published content uses its own read port and Prisma projection. Filter publication state in the query and never fetch editor documents, search text, author IDs, or private SEO just to discard them. Keep the authoring repository separate; public and admin ports must not be interchangeable at the composition root.
- Plugin `meta` and HTML slots are intentionally extensible public output. A trusted plugin can publish anything it can access; DTO validation is not a sandbox for uploaded server code.
- Public browser code imports pure helpers from `@cms/sdk/format` or `@cms/sdk/tree`; type-only imports may use the root. Do not pull the schema barrel into a public bundle for a display helper. Server-side response validation remains mandatory.
- Avoid repeated hierarchy scans: index children once and traverse with a visited set. Slot rendering without providers performs no content/settings reads, and content pages fetch only their content-context slots. Do not optimize by caching authorization or personalized plugin HTML across requests.

### 6.2 Taxonomies, search, and declarative themes

- Categories are hierarchical; tags are flat. Admins manage terms and assign them to content. Public category/tag archives and search use the same published-content reader, filtering before pagination and computing totals with the same criteria.
- Content input accepts `categoryIds` and `tagIds`. Content list queries accept `search`, `category` (slug), and `tag` (slug), in addition to existing pagination/type filters. Admin queries additionally accept `status`.
- Public search uses `/?q=...` and includes published posts and pages. Category/tag archives likewise include every assigned published content type. Existing root content URLs such as `/search`, `/category`, and `/tag` remain valid and editable; only `admin` is reserved.
- Themes are **WordPress-style block themes** (`packages/sdk/src/themes.ts`, `blocks.ts`): a `.zip` with `theme.json` (id, name, version, author, `settings.color.palette` with the required slugs `base`/`surface`/`contrast`/`muted`/`accent`/`border`, `settings.typography.fontFamilies`, `settings.layout.contentSize`/`wideSize`, `styles` and `templateParts`), `templates/<name>.json`, `parts/<slug>.json` and an optional `style.css`. A theme is data, never code: templates and parts are trees of core blocks (`BLOCKS`: group, columns, template-part, site-title, navigation, search, widget-area, post-title/meta/content/excerpt/featured-image/terms/fields, comments, breadcrumbs, query with post-template/no-results/pagination, query-title, heading, paragraph, site-logo, post-navigation, buttons/button, social-links/social-link, latest-posts, categories, tag-cloud, archives, loginout, …), each attribute declared with type and default and validated by `parseBlocks` (depth 16, 1000 nodes). Link attributes (`LINK`) accept site paths, `http(s):`, `mailto:` and fragments only.
- Block data is loaded per page, for the template that page renders (and the parts it includes) only, in parallel (`lib/server/theme-queries.ts`): independent `query` and `latest-posts` lists, term lists, months (`GET /api/v1/months`) and previous/next entries (`GET /api/v1/adjacent?contentId=`). The site layout loads only the `404` template's data, for error pages; pages reuse what it loaded instead of asking again. Block data never uses the visitor's session. Content pages start the path lookup and slots before the layout finishes.
- Templates follow the WordPress hierarchy (`lib/theme/template.ts`): `front-page`; `single-<type>-<slug>` → `single-<type>` → `single` → `singular`; `page-<slug>` → `page` → `singular`; `category-<slug>` → `category` → `archive` (tag, author alike); `archive-<type>`; `date`; `home`; `search`; `404`; always ending in `index` (required). `query` blocks inherit the page query by default. With `inherit: false`, each block selects published content by type, category, tag, author and count; the frontend loads these on the server and deduplicates selections. A theme is limited to 32 independent query blocks.
- `style.css` is applied inside `@scope (.cms-site)`. `cssProblem` refuses markup, backslash escapes, `@import`, `url()`, `image-set()` and other resource loads, and unbalanced braces outside comments/strings (so it cannot leave the scope). Fonts are font stacks only (no font files).
- Appearance → Themes uploads/upgrades zips (2 MB, unpacked by `infra/zip-theme-archive.ts` with fflate; per-file and total size limits), activates, previews and removes themes. Built-in themes (`canvas` default, `editorial`, `journal`) cannot be replaced or removed. Appearance → Editor (site editor) changes templates, template parts and global styles (palette colors, fonts, size, line height, radius) of any theme; changes are stored beside the theme (`themes.customizations` setting) and can be reset, and new hierarchy templates (e.g. `category-news`) can be added. Public theme DTOs carry the effective theme only, no management state.
- Signed-in visitors see a WordPress-style toolbar on the public site (dashboard, edit site, new, edit this entry, account). The public layout reads only the session cookie for it (via `getAll`) and passes `{ name, role }`; such responses are never cached.
- Theme selection changes presentation only. Content, taxonomy archives, search, and every plugin slot must work with every theme and with no active plugins.
- Reference behavior: [WordPress categories and tags](https://make.wordpress.org/support/user-manual/categories-and-tags/), [global settings and styles](https://developer.wordpress.org/themes/global-settings-and-styles/), and [theme management](https://wordpress.org/documentation/article/appearance-themes-screen/).

### 6.3 Core SEO and permalinks

- SEO is a core capability, independent of installed plugins and selected themes. Its settings and content/term metadata are validated through `@cms/sdk`. Global settings contain only publishable metadata/crawler policy; never analytics credentials or provider secrets.
- `AdminEntrySeo.focusKeyword` is editorial data, not public metadata. Public content, taxonomy, discovery, page data, JSON-LD, feeds, and Markdown must use the public SEO allowlist. Omitting `seo` from a content/term update preserves saved SEO rather than clearing it.
- Public pages render one authoritative SSR metadata set: title/description, canonical, robots directives, OpenGraph/Twitter, and escaped JSON-LD. Structured data must describe visible content; no fabricated ratings, authors, FAQs, or ranking guarantees. Core routing identity and SEO policy cannot be overwritten by `content.public` filters.
- Absolute canonical/discovery URLs come only from the configured public `siteUrl`, never a request's Host header. Missing configuration must not invent localhost URLs. Search pages and empty archives are not indexable. `noindex` is not access control; pages remain public, and crawlers must be able to read the directive.
- Sitemaps use a lightweight, paginated published-content projection, not full editor documents or HTML. Drafts, `noIndex` entries, and entries canonicalized to another URL are excluded. Indexing/category/tag settings apply consistently across metadata and discovery.
- `llms.txt` is an optional discovery proposal, not a ranking feature. Markdown alternates contain published content only, point to the real canonical URL, and never expose editorial JSON or private metadata. AI search and training crawler controls are independent; robots rules are advisory, not authorization.
- Permalink settings are per content type (`post`, `article`, `page`). The default `/%slug%` preserves existing URLs. Tokens include `%year%`, `%month%`/`%monthnum%`, `%date%`/`%day%`, `%hour%`, `%minute%`, `%second%`, `%title%`, `%slug%`/`%postname%`, `%id%`/`%post_id%`, `%category%`, `%author%`, and `%pagename%`; dates use UTC, and `%title%` uses `encodeURIComponent(title)` rather than slugification.
- `/p/%year%%month%%date%` produces `/p/20261022`; `/post/%title%` produces an encoded-title URL. Date-only templates can collide. Reject collisions atomically rather than changing a URL silently or serving the wrong entry. Reserve administrative/discovery routes and reject traversal, external URLs, and unsupported tokens.
- Canonical content paths and history belong to persistent routing data, not client-side guesses. Content links, SEO, feeds, sitemaps, and previews must use the same path. Existing aliases redirect directly to the latest published path; drafts and deleted entries never resolve publicly.
- API contracts: `GET /api/v1/seo` (public settings), `GET/PUT /api/v1/admin/seo` (authenticated settings), `GET /api/v1/seo/sitemap?kind=content|category|tag&page=&pageSize=` (bounded discovery), `GET /api/v1/permalinks` and `GET/PUT /api/v1/admin/permalinks` (templates), and `GET /api/v1/resolve?path=` (published content plus a redirect flag). The web exposes `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:page.xml`, `/feed.xml` (also `?category=`, `?tag=`, `?author=`; full text or excerpt per Settings → Reading, with `dc:creator`, categories and the first audio file as enclosure; types marked searchable except pages; bodies of unprotected entries are read four at a time and enclosures carry the library file's size; `?category=` etc. must be a whole valid slug), `/llms.txt`, and `/:slug.md`. Feed discovery links appear only while the feed is served (indexing on and site URL set). Configure these in `/admin/seo`.
- API contracts: `GET /api/v1/seo` (public settings), `GET/PUT /api/v1/admin/seo` (authenticated settings), `GET /api/v1/seo/sitemap?kind=content|category|tag&page=&pageSize=` (bounded discovery), `GET /api/v1/permalinks` and `GET/PUT /api/v1/admin/permalinks` (templates), and `GET /api/v1/resolve?path=` (published content plus a redirect flag). The web exposes `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:page.xml`, `/feed.xml`, `/llms.txt`, and `/:slug.md`. Configure SEO in `/admin/seo`; permalink patterns and category/tag bases live in Settings → Permalinks (`/admin/settings/permalinks`), as in WordPress.
- Reference: [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [robots directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [OpenGraph](https://ogp.me/), [sitemaps](https://www.sitemaps.org/protocol.html), [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/), and [WordPress permalinks](https://wordpress.org/documentation/article/customize-permalinks/).

### 6.4 Users, roles and protection

- Roles are WordPress-style (`administrator`, `editor`, `author`, `contributor`) and grant capabilities (`packages/sdk/src/capabilities.ts`, pure and browser-safe). Services authorize with `authorize(actor, capability)`; routes may also pass a capability to `session(app, capability)`. Content rules distinguish own entries (`content.create`/`content.publish`) from others' (`content.editOthers`). At least one administrator always remains (serialized writes). Author choices (`GET /api/v1/admin/users/authors`, `content.editOthers`) are `{ id, name, slug }`; the slug feeds the admin content list's `author` filter.
- Password reset and invitations send single-use tokens by email; API tokens (`cms_pat_…`) authenticate like sessions and are listed/revoked by their owner. Hashes only are stored.
- Administrators (`users.manage`) send a reset link with `POST /api/v1/admin/users/:id/password-reset` (no captcha or visitor limit; 20 per administrator per hour) and sign a user out everywhere with `DELETE /api/v1/admin/users/:id/sessions` (API tokens stay). Users list their own sessions at `GET /api/v1/auth/sessions` (opaque ids derived from the session digest, issue and expiry times) and sign one out with `DELETE /api/v1/auth/sessions/:id`. Custom roles are deleted with `DELETE /api/v1/admin/roles/:key?reassignTo=<role>`, which moves their users first.
- Admin content lists sort by `orderBy` (`updatedAt`, `publishedAt`, `title`, `author`, `commentCount`; an SDK allowlist) and `order`, with id as tie-breaker. The dashboard's box order and hidden boxes live in the per-browser `cms_dashboard` cookie; plugin boxes come from `GET /api/v1/admin/dashboard-widgets`.
- `ProtectionService` guards sign-in, password reset, comments and protected-content unlock: DB-backed rate limits (`rate_limit_buckets`, shared by all instances) and captcha (Turnstile, hCaptcha, reCAPTCHA; secrets sealed). An attempt atomically reserves its counters before password, mail or comment work. Unproven visitors share one visitor bucket, so direct API calls cannot bypass the client limit by changing account names. `captcha_required` (403) asks the form for a captcha.
- Password changes and resets atomically update the hash and revoke reset links, other sessions and API tokens. Reset tokens are checked before password hashing and consumed in the same transaction as the credential change.
- Secrets stored in settings (SMTP password, captcha and Meilisearch keys, webhook secrets) are sealed with `SecretBox` (AES-256-GCM, `CMS_SECRET_KEY`) and never returned; admin DTOs expose only `…Configured` flags.

### 6.5 Content workflow, media and fields

- Shared document blocks (`@cms/content`) include images with plain-text captions, alignment and links; uploaded audio/video/downloads; galleries; 2–4 columns; link buttons; details/summary; pullquotes/citations; separators/spacers; paragraph/heading text alignment; and tables with header rows and plain-text captions. All attribute allowlists live in SDK `content-blocks.ts`; `parseDocument` validates them and the existing depth/node budgets before rendering. Attributes that predate the block library (link target/rel/class/title, code language, list start/type, image src/alt/title/size, audio, table cells, heading level, embed URL) accept any bounded scalar, because stored documents keep what Tiptap parsed (`c#`, `target="report"`, `alt="2024"` as a number); unknown attributes are dropped as before, never rendered. Media IDs on images, audio, video and files, and a video's library poster (`posterId`), participate in usage tracking, including nested galleries/columns. Captions, citations and file link text are part of search text and automatic excerpts.
- Media sources keep the existing `/media/…` or credential-free HTTPS policy. Navigation links allow HTTP(S), mailto and relative references, excluding protocol-relative URLs, backslashes and controls. The renderer escapes text/attributes; no stored HTML is accepted. WordPress core block classes are mapped during HTML/WXR import; out-of-range imported settings fall back to defaults, imported documents pass the same validation as editor JSON, and an entry whose body still fails is skipped and reported without stopping the import.
- Document renderer classes (`cms-image`, `cms-video`, `cms-file`, `cms-gallery`, `cms-columns`, `cms-buttons`, `cms-details`, `cms-pullquote`, `cms-spacer`, `cms-table`, `cms-text-*`, `cms-align-*`) are shared by all built-in themes through `lib/theme/site.css`. Wide/full blocks use the site's container and wide-size tokens when post content is centered, and stay within their column when a template places post content in a theme column; columns stack on mobile by default. Editor controls live in `lib/admin/editor/` (inserter, `/` menu, block settings), with only the `BlockInserter` hook in `Editor.svelte`; image settings (alt, size, alignment, caption, link, replace) are the editor's image bar.

- Statuses: `draft`, `pending`, `scheduled`, `published`, `private`; trash is separate (`trashedAt`, emptied after 30 days). Scheduled entries publish through the `content.publishScheduled` task. Revisions and autosaves are kept per entry; preview links are signed and expire.
- Content updates accept `expectedUpdatedAt` (the `updatedAt` the client read): a stale value is refused with `conflict` under the write lock, so partial editors such as Quick Edit never overwrite a newer body. Omitting `extraTermIds` keeps custom terms; an explicit `publishedAt` replaces the stored date. Admin lists accept `orderBy` (`updatedAt` default, `publishedAt`) and `order` (`desc` default, `asc`).
- Partial editors (Quick Edit, Bulk Edit) also send `preserveAutosave: true`: the API refuses with `conflict` while the user has a pending autosave and never discards one. The check runs under the content write lock, which autosaves take too, and an autosave is always dated after the entry's last save. Bulk form actions dedupe and cap ids at 100, run at most 4 API calls at once (`#lib/server/bulk.js`) and report per-item failures instead of stopping at the first.
- Screen Options (columns, items per page) for the content, comments and media lists live in per-browser `cms_screen_<list>` cookies written by `ScreenOptions.svelte`; the server reads them as untrusted input (`readScreenOptions`).
- Password-protected entries serve an empty body and excerpt until the visitor sends a signed unlock proof (httpOnly cookie on the web). Unlock attempts use the same visitor proof, atomic rate limit and captcha path as other public security actions. Search text is not stored for locked bodies.
- Editor documents are limited to depth 100 and 10,000 JSON nodes; category/tag assignments are limited to 100 each. Media uploads stream through the web process, stop at `MEDIA_MAX_MB`, and image transforms run one at a time with a 40-megapixel decode limit.
- Media: `PUT /api/v1/admin/media/:id` changes only the sent `alt`/`caption` (omitted fields keep their text). Uploads are sniffed by content, images get metadata stripped and WebP sizes; files live under `MEDIA_DIR` and are served through the web `/media/…` proxy. Content keeps media links for usage and the featured image.
- Content types and custom fields are core settings. Field values are validated against definitions; only public fields reach public DTOs (single reads only).

### 6.6 Reading, menus and widgets

- Site identity (Settings → General): a site icon (favicon/`apple-touch-icon`; `/favicon.ico` redirects to it or the default icon without rendering a page) and a custom logo for the `site-logo` block (also the JSON-LD logo when SEO has none). `<html lang dir>` follows the site locale on public pages (`locals.lang`, set by the site layout).
- Body images are served with `srcset`/`sizes` from the library's WebP sizes, intrinsic dimensions and lazy loading after the first image (`domain/content/responsive-images.ts`, applied after embeds).

- Reading settings choose the front page (latest posts, or a static page plus a posts page), posts per page, feed size and content (full text or excerpt), date format and time zone. The static front page is served at `/` (its own path redirects there, and it is canonical at `/`); the posts page lists posts with sticky entries first.
- Menus (`primary`, `footer` locations) and widgets (`sidebar`, `footer` areas) are core settings. The menu editor needs only `appearance.manage`: its pickers read the public published-only API, and `GET /api/v1/admin/menus/targets` labels the published entries saved menus link to (`{ id, title, type }`, read in chunks from the published projection). Public menu and widget DTOs resolve targets server-side and drop anything not public. Themes fall back to the pages list and categories when no menu or widget is set. Date archives live at `/date/<year>[/<month>]` (UTC) and are never indexed.

### 6.7 Comments

- Password-protected entries require the existing `x-cms-unlock` proofs for comment reads and submissions. Locked entries do not render comments; recent-comment widgets exclude protected entries.
- Public comment submissions accept an optional bearer session. A verified user's `userId`, name and email come from the profile, never the submitted identity. Discussion `requireLogin` rejects anonymous submissions; moderators still use the moderation capability.
- `GET /api/v1/comments` returns `viewer` (name only), `requireLogin`, and `ownPending`. `x-cms-comment-pending` carries a signed, entry-bound, 24-hour receipt; only that receipt's currently pending comment is shown. Spam/trash and other pending comments remain hidden. Comment responses use `private, no-store`.
- Submission returns `{ status, comment, page, pendingProof }`; `page` identifies the top-level thread's page, including replies. The web keeps `cpage` and failed reply context, and stores the receipt in an httpOnly cookie. Commenter name/email/website are remembered for one year only after an explicit checkbox opt-in. All session, unlock, pending-receipt and commenter-preference responses use `private, no-store`.
- Discussion `showAvatars` defaults off; when enabled `avatarDefault` selects the Gravatar style. Public comments expose only a SHA-256 avatar URL, never an email address. Admin comment DTOs include `parentAuthor` for reply context; moderation supports a `contentId` filter.

- Comments are core: plain-text bodies, threaded up to the configured depth, paginated by top-level comment. Public DTOs never contain email addresses. `contents.comment_count` counts approved comments and is updated in the same transaction as every status change.
- Submission order: validation, rate limit/captcha, honeypot (accepted silently, stored nowhere), open check (discussion on, type supports comments, entry allows them, age limit), reply check, block/hold words and link limit, moderation mode (`manual`, `known`, `auto`), `comment.beforeSave` filter (only `body` and `status` are taken), insert, hooks, notification mail (queued). Held and spam comments both answer `pending`.
- Moderators (`comments.moderate`) approve, unapprove, mark spam, trash, delete, edit and reply (replying approves the parent). Deleting a comment moves its replies up. Spam and trash older than 30 days are purged by a task.

### 6.8 Search with Meilisearch

- MariaDB is the source of truth and always able to answer (`FULLTEXT` over title, excerpt and body text). Meilisearch is an optional accelerator configured in Settings → Search (host, sealed key, index prefix). Category scopes use a recursive CTE from the requested root instead of loading the whole hierarchy.
- Every content write that can change public results inserts into `search_outbox` in the same transaction (term changes and bulk deletes queue a full rebuild with a null `content_id`). The `search.sync` task drains the outbox into Meilisearch and rebuilds by building `<prefix>_content_next` and swapping it in.
- Public search uses the index only while it is enabled, built for the current host and index, not recently failing (30 s pause after an error) and the outbox is empty; otherwise it uses the database. Results are ids only; summaries are always loaded from MariaDB, so nothing unpublished can appear. Author-filtered searches always use the database. Admin search always uses the database.

### 6.9 Webhooks, import/export, site health and caching

- Webhooks (Tools → Webhooks, `tools.manage`) subscribe to core action events and are delivered as jobs: JSON POST to https only, no redirects, header `X-CMS-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<body>")>`, retried with backoff; 4xx other than 408/429 stop retries. The secret is shown once at creation or rotation.
- Import/export (Tools → Import & export) speaks WordPress WXR 1.2. Import is capped at 16MB, 10,000 entries, 20,000 terms and 100,000 comments; it creates data through the core services and refuses DTDs. Export reads content and comments with id cursors and streams XML through API and web without collecting the site in memory. Entry passwords remain omitted.
- Site health (Tools → Site health) reports site address, email, search, overdue or failing tasks, failed deliveries, failed plugins and visitor proof.
- Page caching: Settings → Reading `cacheSeconds` (0 = off). The web adds `s-maxage` to anonymous public GETs, re-reading the setting at most once a minute.
- Theme previews: `POST /api/v1/admin/themes/:id/preview` returns a signed 30-minute token; the web keeps it in the `cms_theme_preview` cookie and the public layout asks for that theme. Responses for visitors with session, unlock or preview cookies are never marked cacheable.

### 6.10 Extended authoring and addresses

- Canonical single-entry reads accept an optional session. `content.readPrivate` is granted to administrators and editors and may be assigned to custom roles. Private reads remain absent from lists, feeds, sitemaps and Markdown; they use public fields, `noIndex`, and no shared or browser caching. Drafts and trash remain inaccessible through this path.
- Content, term and author slugs accept Unicode letters/digits and combining marks. Generated slugs use NFC; supplied slugs and request paths are not normalized beyond their existing lowercase/percent-encoding rules. Path storage and lookups still compare canonical encoded bytes. Plugin, type and other system identifiers remain ASCII. WXR imports retain Unicode slugs and decode encoded term assignments consistently. Every URL built from a slug percent-encodes it (`archivePath`, `markdownPath`, `encodeURIComponent`), including sitemaps, menus, llms.txt and listing links. Slug availability (`takenSlugs`) is decided by the database column's collation (`café` takes `cafe`), returning the candidates' spelling. Theme query selectors (category/tag/author) and slug-specific template names (`page-소식`) accept the same Unicode slugs. Locked protected entries report `commentCount: 0`; profile names longer than a comment author name (100) are shortened for signed-in comments and moderator replies.

- The site editor provides a live desktop/mobile preview using the public renderer. Unsaved independent query selections are resolved through a read-only form action; stale requests are cancelled. Singular templates preview published content. Reusable patterns use named template parts, including administrator-created parts; editing a part updates every reference.
- Roles include `subscriber` and administrator-defined roles. Role definitions live in separate `role.<key>` settings; built-ins remain fixed. Authenticated profiles receive capabilities resolved on every request, including existing sessions and API tokens. Never trust capabilities from request bodies. Plugin `access: 'admin'` routes require `plugins.manage`.
- User management enables public registration only after email delivery is configured. `/admin/register` sends a single-use password invitation; clients cannot choose a role or initial password. Signup reuses password-reset rate limits/captcha, and every new account is a subscriber. Email changes require `users.manage`; ordinary profile changes preserve roles and resolved capabilities.
- Custom taxonomy definitions use `taxonomy.definition.<key>` settings. `/api/v1/admin/taxonomy-types` lists/saves definitions; existing taxonomy routes manage their terms. Content accepts `extraTermIds`; public/admin DTOs explicitly project strict `extraTerms`. Lists accept the paired `taxonomy`/`term` filter, including descendant terms, before pagination and full-text search. Meilisearch is bypassed for these filters. Public archives live at `/taxonomy/<key>/<slug>`.
- Pages accept an administrator-only `parentId`. Stores check page ancestry, cycles and depth inside the shared permalink transaction. Pages with children cannot change into another content type. `%pagename%` includes ancestor slugs; the fresh-site page pattern is `/%pagename%`. Parent rename/reparent/delete updates affected addresses atomically and preserves published redirects.
- Permalinks accept WordPress tokens, Unicode literals and an optional final slash. `%post_id%` uses this CMS's existing UUID identifier. `%category%` chooses the first assigned category by name then id and includes ancestors; an unassigned entry uses `uncategorized`. `%author%` uses the public author slug. The public SvelteKit layout uses `trailingSlash = 'ignore'`; the API owns canonical redirects.
- Category/tag prefixes are configured separately at `/api/v1/admin/permalinks/archives`; public state is read at `/api/v1/permalinks/archives`. Previous prefixes redirect. Archive prefixes and content paths share a transaction lock and reject collisions in both directions. Canonical metadata, menus, term links, widgets and sitemaps use configured prefixes.
- Media supports MP3, WAV and Ogg audio by signature, including the shared editor's audio node and usage tracking. `POST /api/v1/admin/media/:id/edit` validates crop coordinates and permits image crop/rotation/flips. Editing creates a new WebP media item and keeps the original and existing content references unchanged. Animated GIF editing is not offered.
- `20261105000000_custom_taxonomies` changes taxonomy keys from ENUM to VARCHAR without deleting terms. `20261106000000_page_hierarchy` adds nullable page ancestry with an index and self-reference. Production migration execution is separate from preparing and testing these files.

## 7. HTTP API

모든 오류 응답: `{ "error": { "code", "message", "issues?" } }`.

| 메서드 | 경로                                                     | 인증     | 설명                                                      |
| ------ | -------------------------------------------------------- | -------- | --------------------------------------------------------- |
| GET    | `/api/health`                                            |          | 상태 확인                                                 |
| GET    | `/api/v1/site`                                           |          | 사이트 설정 (아이콘·로고는 공개 이미지로)                 |
| GET    | `/api/v1/layout`                                         |          | 사이트·SEO·테마·읽기·메뉴·위젯 묶음                       |
| GET    | `/api/v1/content?type&page&pageSize&search&category&tag` |          | 발행 콘텐츠 요약 목록 (`content.publicSummary` 필터 적용) |
| GET    | `/api/v1/content/:slug`                                  |          | 발행 콘텐츠 1건                                           |
| GET    | `/api/v1/slots?path&contentId`                           |          | 슬롯 HTML                                                 |
| GET    | `/api/v1/auth/status`                                    |          | `{ setupRequired }`                                       |
| GET    | `/api/v1/install/status`                                 |          | `{ databaseConfigured, setupRequired }`                   |
| POST   | `/api/v1/install/database`                               | 설치 키  | DB 검증·마이그레이션·접속 설정 저장                       |
| POST   | `/api/v1/install/complete`                               | 설치 키  | 사이트·첫 관리자·세션을 원자적으로 생성                   |
| POST   | `/api/v1/auth/login` · `/logout`                         |          | 세션 발급/폐기                                            |
| GET    | `/api/v1/auth/me`                                        | ✔        | 현재 사용자                                               |
| GET    | `/api/v1/auth/sso`                                       |          | SSO 사용 가능 여부와 표시 이름                            |
| POST   | `/api/v1/auth/sso/start`                                 | 선택     | SSO 로그인/연결 시작 (연결은 로그인 필요)                 |
| POST   | `/api/v1/auth/sso/callback`                              | 선택     | 제공자 응답 검증 후 세션 발급 또는 연결 완료              |
| GET    | `/api/v1/auth/sso/identity`                              | ✔        | 현재 사용자의 SSO 연결·운영자 할당 상태                   |
| DELETE | `/api/v1/auth/sso/identity`                              | ✔        | 현재 사용자의 SSO 연결 해제                               |
| CRUD   | `/api/v1/admin/content[/:id]`                            | ✔        | 모든 상태의 콘텐츠                                        |
| GET    | `/api/v1/admin/site`                                     | ✔        | 사이트 설정 (아이콘·로고 id와 이미지)                     |
| PUT    | `/api/v1/admin/site`                                     | ✔        | 사이트 설정 저장 (`iconId`/`logoId`는 미디어 이미지)      |
| GET    | `/api/v1/admin/plugins`                                  | ✔        | 플러그인 목록                                             |
| POST   | `/api/v1/admin/plugins`                                  | ✔        | 번들 업로드(본문 = JS 소스) 설치/업그레이드               |
| POST   | `/api/v1/admin/plugins/:id/enable·disable`               | ✔        | 활성화/비활성화                                           |
| PUT    | `/api/v1/admin/plugins/:id/settings`                     | ✔        | 설정 저장 (manifest 기준 검증)                            |
| DELETE | `/api/v1/admin/plugins/:id`                              | ✔        | 삭제 (번들·설정·KV 포함)                                  |
| \*     | `/api/plugins/:id/*`                                     | 라우트별 | 플러그인 라우트 게이트웨이                                |

| Method      | Path                                     | Authentication | Contract                                                |
| ----------- | ---------------------------------------- | -------------- | ------------------------------------------------------- |
| GET         | `/api/v1/taxonomies/:taxonomy`           | Public         | Public terms and published counts (`category` or `tag`) |
| GET         | `/api/v1/taxonomies/:taxonomy/:slug`     | Public         | Public archive term                                     |
| GET, POST   | `/api/v1/admin/taxonomies/:taxonomy`     | Session        | List/create terms                                       |
| PUT, DELETE | `/api/v1/admin/taxonomies/:taxonomy/:id` | Session        | Update/delete a term                                    |
| GET         | `/api/v1/theme`                          | Public         | Active theme display manifest                           |
| GET, POST   | `/api/v1/admin/themes`                   | Session        | List/install themes (`application/zip` body)            |
| POST        | `/api/v1/admin/themes/:id/activate`      | Session        | Activate a theme                                        |
| DELETE      | `/api/v1/admin/themes/:id`               | Session        | Remove an inactive custom theme                         |

| Method            | Path                                                                                           | Authentication                      | Contract                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET               | `/api/v1/theme?preview=`                                                                       | Public                              | Active theme, or the theme a valid preview token names                                           |
| POST              | `/api/v1/admin/themes/:id/preview`                                                             | appearance.manage                   | Signed 30-minute preview token                                                                   |
| GET               | `/api/v1/reading · /menus/:location · /widgets`                                                | Public                              | Reading settings (with front/posts page paths), resolved menu, both widget areas                 |
| GET, PUT          | `/api/v1/admin/reading · /menus · /widgets`                                                    | settings / appearance               | Reading settings, menus and locations, widget areas (`GET …/widgets/types` lists plugin widgets) |
| GET, POST         | `/api/v1/comments?contentId=&page=`                                                            | Public (POST rate-limited, captcha) | Approved threads of an entry; submit a comment (`{ status, comment }`)                           |
| GET               | `/api/v1/admin/comments · /comments/counts`                                                    | comments.moderate                   | Moderation list (`status`, `contentId`, `search`) and counts per status                          |
| PUT, DELETE, POST | `/api/v1/admin/comments/:id · /:id/reply · /bulk`                                              | comments.moderate                   | Edit/delete, reply as the moderator, bulk approve/unapprove/spam/trash/delete                    |
| GET, PUT          | `/api/v1/admin/discussion`                                                                     | settings.manage                     | Discussion settings                                                                              |
| GET               | `/api/v1/content-types · /authors/:slug`                                                       | Public                              | Public content types and fields; public author archive                                           |
| *                 | `/api/v1/admin/content-types[/:key] · /fields[/:key]`                                          | content.create / fields.manage      | Content model                                                                                    |
| POST, GET         | `/api/v1/admin/content/:id/{trash,restore,preview,autosave,revisions[/:revisionId[/restore]]}` | Session                             | Content workflow                                                                                 |
| GET               | `/api/v1/preview/:token · POST /api/v1/unlock/:id`                                             | Public                              | Signed preview; password unlock proof                                                            |
| *                 | `/api/v1/admin/media[/:id] · GET /api/v1/media/files/*`                                        | media.upload / Public               | Media library; files with Range support                                                          |
| *                 | `/api/v1/admin/users[/:id] · /users/authors`                                                   | users.manage / content.create       | Users and author choices                                                                         |
| *                 | `/api/v1/auth/password{,/forgot,/reset} · /auth/tokens[/:id] · PUT /auth/me`                   | Session or public                   | Password change/reset, API tokens, own profile                                                   |
| GET, PUT          | `/api/v1/admin/security · /email (POST /email/test) · GET /security/captcha`                   | settings.manage / Public            | Rate limits and captcha, email, public captcha config                                            |
| GET, PUT, POST    | `/api/v1/admin/search · /search/status · /search/test · /search/reindex`                       | settings.manage                     | Meilisearch connection, status, connection test, rebuild                                         |
| GET, POST         | `/api/v1/admin/plugin-pages · /:pluginId/:key · /:pluginId/:key/:action`                       | Page capability                     | Plugin admin pages (blocks) and their form actions                                               |
| GET               | `/api/v1/admin/plugins/:id/update`                                                             | plugins.manage                      | Latest version from the plugin's `updateUrl`                                                     |
| *                 | `/api/v1/admin/webhooks[/:id] · /:id/ping · /:id/rotate`                                       | tools.manage                        | Webhooks, test delivery, new secret                                                              |
| GET, POST         | `/api/v1/admin/export · /admin/import`                                                         | tools.manage                        | WXR export (XML download) and import (XML body)                                                  |
| GET               | `/api/v1/admin/health`                                                                         | tools.manage                        | Site health checks and system info                                                               |
| GET               | `/api/v1/admin/themes/:id/editor`                                                              | appearance.manage                   | Site editor: templates, parts and styles with changes                                            |
| PUT, DELETE       | `/api/v1/admin/themes/:id/templates/:name · /parts/:slug · /styles`                            | appearance.manage                   | Save or reset a template, part or global styles                                                  |
| GET, PUT          | `/api/v1/admin/sso`                                                                            | settings.manage                     | Single sign-on settings (client secret never returned; redirect URI shown)                       |
| GET               | `/api/v1/admin/frontend-secret`                                                                | settings.manage                     | The web server's visitor-proof secret (server-to-server only, never sent to browsers)            |

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
- **서버 시작/종료**: `createBootstrap`이 돌려주는 `app`(Elysia)을 `main.ts`가 `app.listen({ port, hostname, maxRequestBodySize })`로 시작하고 `app.stop()`으로 끝냅니다.
- **Elysia 업스트림 가정**: 요청 URL에서 경로 시작(`/`)을 11번째 문자 이후에서 찾습니다(`indexOf("/", 11)`). `http://` + 호스트가 3자 이하이고 포트가 없는 URL(`http://api/…`)은 모든 경로가 404가 되므로 그런 호스트명으로 API를 노출하지 마세요. 테스트는 `http://localhost/...`를 씁니다.

### 7.2 SSO (OpenID Connect)

OIDC Authorization Code + PKCE를 사용합니다. **설정 → 싱글 사인온**에서 켭니다(제공자 주소, 클라이언트 ID·비밀(봉인 저장), 인증 방식, 스코프, 연결 없이 허용할 주체). 리디렉션 URI는 SEO 설정의 공개 사이트 주소 + `/admin/sso/callback`이며 화면에 표시됩니다. 설정이 바뀌면 다음 요청부터 새 제공자 클라이언트를 씁니다. 아래 환경변수로 서버에서 고정할 수도 있으며, 그 경우 관리자 설정보다 우선합니다(`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`가 **모두** 있어야 하고 일부만 있으면 시작 시 설정 오류). 비밀 값은 API 서버에만 있습니다.

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
| `OIDC_FRONTEND_SECRET`              | `CMS_FRONTEND_SECRET`의 옛 이름(선택). 없으면 자동 연결된 비밀을 씁니다               |
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
- **클라이언트 식별**: API는 웹 서버만 보므로 방문자 주소는 웹 서버가 증명합니다. 웹은 보호되는 요청(로그인·비밀번호 재설정·댓글·SSO 시작)에 `getClientAddress()`(adapter-node의 프록시 설정 `ADDRESS_HEADER`/`XFF_DEPTH`를 따름)와 프런트엔드 비밀을 `x-cms-client-address`/`x-cms-frontend-secret` 헤더로 보냅니다. API는 비밀이 일치할 때만(상수 시간 비교) 주소를 믿고 IPv4 주소 또는 IPv6 /64 단위로 셉니다. 비밀이 없거나 틀린 요청(API 직접 호출 포함)은 주장한 주소와 무관하게 하나의 공용 할당량과 속도를 나눠 씁니다. 연결 요청은 사용자 단위로 셉니다. 속도 제한과 등록 상한은 같은 클라이언트 키를 씁니다. 여러 주소를 가진 공격자는 전체 상한까지 채울 수 있습니다.
- 라우트 파일: `http/routes/api/v1/auth/sso/{index,start,callback,identity}.ts`, `admin/sso.ts`, 서비스: `domain/auth/sso-service.ts`, 설정: `domain/auth/sso-settings.ts`, 클라이언트 식별: `http/client-identity.ts`.
- 마이그레이션 `20261023000000_sso_exact_identity_sessions`는 적용 시 **모든 세션과 대기 중 SSO 요청을 삭제**합니다(모두 다시 로그인). 계정·연결·콘텐츠·플러그인은 유지됩니다. 적용 전에 DB를 백업하세요.

### 7.3 HTML·CSS·JS minify

압축은 빌드 때만 합니다. 브라우저 JS·CSS는 Vite의 Oxc·Lightning CSS가, 컴포넌트 마크업은 Svelte 컴파일러가 공백을 줄입니다. SSR HTML은 요청마다 렌더링되므로 런타임 minify를 하지 않습니다(요청별 CPU 비용, 스트리밍 차단). 본문 HTML·JSON-LD 같은 동적 출력은 압축되지 않으며, 전송 크기는 gzip/brotli(리버스 프록시)로 줄입니다.

## 8. 데이터베이스

- 스키마: `apps/api/prisma/schema.prisma`. 클라이언트는 `src/infra/prisma/generated`로 생성됩니다(커밋하지 않음).
- 스키마 변경: `bun run --filter @cms/api db:migrate:dev -- --name <설명>` → 생성된 SQL 검토 → 커밋. 배포 시 `db:migrate`.
- Prisma 사용은 `apps/api/src/infra/` 안에서만 합니다. 도메인으로 Prisma 타입을 노출하지 마세요(레코드 타입은 포트에 정의).
- 테이블: `users`, `user_identities`(SSO 연결), `sso_transactions`(진행 중인 SSO 요청), `sessions`, `password_tokens`, `api_tokens`, `contents`, `content_revisions`, `content_paths`(현재 주소·리디렉션 이력), `taxonomy_terms`(카테고리·태그), `content_terms`(콘텐츠 분류 연결), `media`, `content_media`, `comments`, `search_outbox`, `scheduled_tasks`(반복 작업 임대), `jobs`(재시도되는 일회성 작업: 메일·웹훅), `rate_limit_buckets`, `settings`(사이트·테마·SEO·고유주소·읽기·메뉴·위젯·토론·보안·메일·검색·웹훅·콘텐츠 유형/필드 설정과 동시성 잠금), `plugins`, `plugin_data`.
- `20261024000000_taxonomies_search`는 기존 콘텐츠를 유지하며 `contents.search_text`를 HTML 본문에서 채운 뒤 필수 컬럼으로 바꿉니다. 이후 저장부터는 검증된 에디터 문서의 일반 텍스트로 갱신합니다. 분류 연결은 외래 키로 보호하고, 분류 계층 변경은 공통 설정 행 잠금으로 직렬화합니다.
- `20261025000000_core_seo`는 기존 콘텐츠/분류에 기본 SEO 값을 추가하고 `article` 유형을 허용합니다. `20261026000000_permalinks`는 기존 `/<slug>` 주소를 바이트 단위로 보존해 현재 주소로 등록합니다. 새 주소와 이력은 SHA-256 키와 실제 경로 바이트를 함께 비교하며, 주소 변경·콘텐츠 저장은 공통 행 잠금과 트랜잭션 안에서 처리합니다. 최초 발행 시각은 이후 비공개로 바꿔도 유지합니다. 이전 버전이 이미 지운 발행 시각/주소 이력은 복원할 수 없습니다. `content_paths`의 외래 키는 `ON UPDATE RESTRICT`입니다. MariaDB는 연쇄 갱신(`CASCADE`) 외래 키 컬럼을 CHECK 제약(`current_for = content_id`)에 쓰지 못하게 하며, 콘텐츠 id는 바뀌지 않습니다.
- `20261027000000_list_indexes`는 목록 정렬 인덱스(`contents(status, published_at)`, `contents(updated_at)`)와 만료 세션 정리용 `sessions(expires_at)`를 추가합니다. 데이터는 바꾸지 않습니다. 만료 세션은 제시될 때와 시간별 유지보수에서 삭제됩니다. 콘텐츠 sitemap은 `content_paths.current_for` 인덱스 순서로 페이지를 나눕니다.
- `20261107100000_session_created_at`은 `sessions.created_at`을 추가합니다(기존 세션은 마이그레이션 시각). 데이터는 지우지 않습니다.
- `20261028000000_users_roles`부터 `20261103000000_search_outbox`까지는 역할·사용자 프로필, 작업·속도 제한·토큰, 콘텐츠 워크플로, 미디어, 필드, 댓글, 검색 outbox를 추가합니다. `20261104000000_content_fulltext`는 MariaDB 폴백 검색용 복합 FULLTEXT 인덱스를 추가합니다.
- 반복 작업은 `scheduled_tasks` 임대로 인스턴스 하나에서만 돌며 실행 중 임대를 갱신합니다. 잡은 `SELECT … FOR UPDATE SKIP LOCKED`로 네 개씩 가져와 병렬 처리하고, 완료·실패·임대 해제는 현재 소유자만 할 수 있습니다. 속도 제한은 행 잠금 트랜잭션에서 시도를 예약합니다.
- 콘텐츠 쓰기(저장·휴지통·예약 발행·삭제)는 같은 트랜잭션에서 `search_outbox`에 기록합니다. 분류 수정/삭제와 작성자 콘텐츠 일괄 삭제는 `content_id = NULL`(전체 재색인)을 기록합니다. 트리거는 쓰지 않습니다(바이너리 로그가 켜진 MariaDB에서 권한 문제가 생깁니다).
- 플러그인을 위한 테이블/컬럼 추가 금지. 플러그인 데이터는 `plugin_data`(settings/kv)만 씁니다.

## 9. 테스트

- **테스트도 비용입니다. 추가하기 전에 반드시 “이 테스트가 중요한가?”를 판단합니다.** 모든 경우를 완벽히 검증하거나 커버리지 수치를 채우는 것을 목표로 삼지 않습니다. 일회성·국소적 확인, 구현 형태/코드 모양만 고정하는 테스트, 기존 검증과 중복되거나 회귀 비용이 낮은 테스트는 추가하지 않습니다.
- **오래 유지할 가치가 있는 핵심 회귀만 추가합니다.** 비밀 정보 유출·인증/권한 경계·데이터 손실/무결성·주요 사용자 흐름의 실패처럼 실제 피해가 큰 동작을 우선합니다. 같은 위험은 기존 테스트/통합 흐름을 확장해 검증하고, 사소한 헬퍼·필드마다 독립 테스트를 늘리지 않습니다. 기존 검사 결과를 재사용하며 실패·변경으로 무효화된 검사만 다시 실행합니다.
- `bun test` (루트). 테스트는 각 패키지의 `test/` 또는 `*.test.ts`.
- 도메인·플러그인 런타임은 `apps/api/test/support`의 인메모리 어댑터와 `createRuntime()`으로 DB 없이 테스트합니다. 새 포트를 만들면 인메모리 구현도 같은 계약으로 추가합니다.
- 플러그인 관련 변경은 **비활성화·삭제·실패 시 코어가 원래대로 동작함**을 검증하는 테스트를 반드시 포함합니다(`plugin-host.test.ts` 참고).
- 인메모리 어댑터는 `memory*.ts`(콘텐츠·공개 콘텐츠·분류·사용자·작업·보안·리비전·미디어·댓글·검색)에 있습니다. 검색은 `MemorySearchEngine`/`MemorySearchSource`로 폴백 보장을 검증하고, WXR은 내보내기→가져오기 왕복으로 검증합니다.
- Prisma 어댑터는 실제 MariaDB가 필요합니다. SSO 어댑터와 마이그레이션은 `CMS_TEST_DATABASE_URL`(DB 생성 권한이 있는 서버 계정)을 설정했을 때만 `apps/api/test/sso-prisma.test.ts`가 검증합니다. 이 테스트는 `cms_sso_test_<uuid>` DB를 새로 만들어 마이그레이션을 적용하고 끝나면 지웁니다. URL에 적힌 DB는 쓰지 않습니다. 설정하지 않으면 건너뜁니다.

## 10. 작업 체크리스트

- [ ] 새 책임은 새 모듈로 분리했다 (SRP). 구체 구현은 `infra/`와 `container.ts`에만 있다 (DIP).
- [ ] 코어가 특정 플러그인을 알지 못한다. 새 확장 지점은 범용이다.
- [ ] 플러그인이 꺼지거나 실패해도 코어가 동작함을 테스트했다.
- [ ] 신뢰 경계 입력을 검증했다.
- [ ] named import/export, `import type` 을 지켰다.
- [ ] 새 의존성은 최신 안정 버전이며 `bun add`로 추가했다.
- [ ] `bun run check` 가 통과한다.
- [ ] 추가한 테스트가 중요한 회귀 위험을 막는지 판단했고, 일회성·국소·중복 테스트는 남기지 않았다.
- [ ] API·확장 지점·규약이 바뀌면 이 문서를 갱신했다.
