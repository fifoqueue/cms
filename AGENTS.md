# AGENTS.md

이 저장소에서 작업하는 모든 에이전트와 사람을 위한 규칙입니다. **"반드시"/"금지"로 표시된 항목은 예외 없이 지킵니다.** 규칙과 충돌하는 요청을 받으면 구현하기 전에 충돌을 알리세요.

## 1. 개요

WordPress·Ghost 같은 **헤드리스 CMS**입니다.

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

운영 실행·릴리스 승격·설치 마법사·환경변수·비밀 키는 [docs/operations.md](docs/operations.md)를 봅니다. **`.env` 없이 운영할 수 있어야 하며**, 새 설정은 env 전용이 아니라 관리자 설정으로 만듭니다.

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
  web/        @cms/web      SvelteKit 앱
plugins/
  reading-time/  @cms-plugin/reading-time  예제 플러그인 (빌드 결과를 관리자 화면에서 업로드)
```

`apps/api`와 `apps/web`의 세부 디렉터리 구성은 각 앱의 [apps/api/AGENTS.md](apps/api/AGENTS.md#디렉터리-구성), [apps/web/AGENTS.md](apps/web/AGENTS.md#디렉터리-구성)에 있습니다.

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
- **반드시**: 비활성화·삭제·실패한 플러그인이 코어 동작을 방해하지 않아야 합니다(플러그인 [격리 보장](docs/plugins/lifecycle-and-isolation.md) 참고). 코어 기능은 플러그인이 하나도 없을 때 완전히 동작해야 합니다.
- 플러그인은 `@cms/sdk` 와 `@cms/sdk/plugin` 만 의존합니다. `@cms/api`, `@cms/web`, `@cms/content`, `@prisma/*` import는 금지(ESLint 강제).

### 4.3 코드 스타일

- **이름 있는(named) import/export 사용.** `import * as` 금지, default export 금지, default import는 `.svelte`·에셋(`.svg` 등)·CSS 와 도구 설정 파일(`*.config.*`)에서만 허용(ESLint 강제). 타입은 `import type`.
- **변수·함수명은 설명문처럼 짓지 않습니다.** `adminRequiredForAuthorizedTasks`처럼 조건·목적·행동을 문장으로 나열하지 말고 `requireAdmin`, `isPublished`, `permalinks`처럼 맥락에 맞는 짧고 정확한 도메인 명사·동사를 사용합니다. 모듈·클래스가 이미 알려주는 맥락을 이름에 반복하지 않으며, 긴 설명은 주석이나 타입으로 옮깁니다. 글자 수만 줄이는 불명확한 약어도 금지합니다. 기존 코드 수정 시에도 이 원칙을 적용하고 모든 참조를 함께 고칩니다. 공개/관리자 DTO 구분 등 필요한 계약 의미는 유지하며, 외부 라이브러리 옵션·표준 필드명은 임의로 바꾸지 않습니다.
- **프로젝트 내부 모듈은 반드시 이름 있는 경로 alias로 import/re-export 합니다.** `../../../../`를 비롯한 모든 `../`·`./` 상대 모듈 경로를 금지합니다. API는 `#api/<src 기준 경로>`, API 테스트는 `#test/<test 기준 경로>`, SDK는 `#sdk/*`, 콘텐츠 패키지는 `#content/*`, 웹은 `#lib/*` 또는 `#web/*`, 예제 플러그인 내부는 `#plugin/*`를 사용합니다. `package.json`의 `imports`가 런타임과 TypeScript 모두에서 같은 경로를 해석해야 하며, 타입 전용·동적 import에도 적용합니다. 유일한 모듈 예외는 SvelteKit이 생성하는 `./$types`입니다. `tsconfig`의 `extends`, 파일시스템 경로, URL은 모듈 import가 아니므로 대상이 아닙니다. 패키지 간에는 기존 공개 `@cms/*` 계약만 사용하고 alias로 아키텍처 경계를 우회하지 않습니다. ESLint가 상대 import/re-export와 경계 위반을 차단합니다.
- 웹 테스트와 테스트 픽스처에는 `#web-test/*`를 사용합니다. 테스트 때문에 상대 import 예외를 추가하지 않습니다.
- **공개 DTO/관리자 DTO 분리는 필수입니다.** DB 레코드·설정·사용자 객체를 그대로 반환하거나 펼쳐서 SvelteKit load/action 데이터에 넣지 않습니다. 공개/관리자 DTO의 허용 필드를 각각 명시적으로 매핑하고 SDK 런타임 스키마로 검증합니다. 비밀번호·해시·토큰·DB 접속 정보·SSO 비밀 값은 어느 화면의 직렬화 데이터에도 포함하지 않습니다. 공개 DTO에 초안·에디터 문서·관리자 식별 정보가 섞이지 않도록 회귀 테스트를 유지합니다. 오류 상세도 `{ path, message }`만 전달하며 플러그인 예외 원문은 서버 로그에만 남깁니다([DTO 경계](apps/web/AGENTS.md#공개관리자-dto-경계)).
- Prettier: 들여쓰기 2칸, LF, 작은따옴표, 후행 쉼표 `all` (`.prettierrc`, `.editorconfig`, `.gitattributes`).
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

## 테스트

- **테스트도 비용입니다. 추가하기 전에 반드시 “이 테스트가 중요한가?”를 판단합니다.** 모든 경우를 완벽히 검증하거나 커버리지 수치를 채우는 것을 목표로 삼지 않습니다. 일회성·국소적 확인, 구현 형태/코드 모양만 고정하는 테스트, 기존 검증과 중복되거나 회귀 비용이 낮은 테스트는 추가하지 않습니다.
- **오래 유지할 가치가 있는 핵심 회귀만 추가합니다.** 비밀 정보 유출·인증/권한 경계·데이터 손실/무결성·주요 사용자 흐름의 실패처럼 실제 피해가 큰 동작을 우선합니다. 같은 위험은 기존 테스트/통합 흐름을 확장해 검증하고, 사소한 헬퍼·필드마다 독립 테스트를 늘리지 않습니다. 기존 검사 결과를 재사용하며 실패·변경으로 무효화된 검사만 다시 실행합니다.
- `bun test` (루트). 테스트는 각 패키지의 `test/` 또는 `*.test.ts`.

## 10. 작업 체크리스트

- [ ] 새 책임은 새 모듈로 분리했다 (SRP). 구체 구현은 `infra/`와 `container.ts`에만 있다 (DIP).
- [ ] 코어가 특정 플러그인을 알지 못한다. 새 확장 지점은 범용이다.
- [ ] 플러그인이 꺼지거나 실패해도 코어가 동작함을 테스트했다.
- [ ] 신뢰 경계 입력을 검증했다.
- [ ] 이름 있는 import/export와 `import type`을 지켰다.
- [ ] 새 의존성은 최신 안정 버전이며 `bun add`로 추가했다.
- [ ] `bun run check` 가 통과한다.
- [ ] 추가한 테스트가 중요한 회귀 위험을 막는지 판단했고, 일회성·국소·중복 테스트는 남기지 않았다.
- [ ] API·확장 지점·규약이 바뀌면 이 문서를 갱신했다.

## 문서 색인

| 문서                                                                                             | 내용                                                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [apps/api/AGENTS.md](apps/api/AGENTS.md)                                                         | API 계층 구조, 파일 기반 라우팅 규약, DB·Prisma·마이그레이션, API 테스트     |
| [apps/web/AGENTS.md](apps/web/AGENTS.md)                                                         | 프론트엔드 규약, 세션·로그인 경로, DTO 경계, i18n, minify, 웹 테스트         |
| [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md)                                                 | SDK 계약 규칙(공유 스키마, 오류 카탈로그, 클라이언트)과 플러그인 문서 포인터 |
| [docs/plugins/authoring.md](docs/plugins/authoring.md)                                           | 플러그인 작성 방법과 번들 규칙                                               |
| [docs/plugins/extension-points.md](docs/plugins/extension-points.md)                             | 훅·슬롯·등록소 등 확장 지점 표(도메인별)와 확장 원칙                         |
| [docs/plugins/lifecycle-and-isolation.md](docs/plugins/lifecycle-and-isolation.md)               | 플러그인 수명주기와 코어 격리 보장                                           |
| [docs/api/routes.md](docs/api/routes.md)                                                         | HTTP API 라우트 표                                                           |
| [docs/auth/sso.md](docs/auth/sso.md)                                                             | SSO(OpenID Connect) 설정·보안 규칙                                           |
| [docs/auth/sign-in.md](docs/auth/sign-in.md)                                                     | 확장 가능한 로그인 수단·2단계 인증 (작성 예정)                               |
| [docs/features/taxonomies-search-themes.md](docs/features/taxonomies-search-themes.md)           | 분류, 검색, 블록 테마                                                        |
| [docs/features/seo-permalinks.md](docs/features/seo-permalinks.md)                               | SEO, 사이트맵, 고유주소                                                      |
| [docs/features/users-roles-protection.md](docs/features/users-roles-protection.md)               | 사용자, 역할, 속도 제한·캡차, 비밀 값, egress                                |
| [docs/features/content-media-fields.md](docs/features/content-media-fields.md)                   | 콘텐츠 워크플로, 블록, 미디어, 필드                                          |
| [docs/features/reading-menus-widgets.md](docs/features/reading-menus-widgets.md)                 | 읽기 설정, 메뉴, 위젯, 사이트 편집기                                         |
| [docs/features/comments.md](docs/features/comments.md)                                           | 댓글과 토론 정책                                                             |
| [docs/features/meilisearch.md](docs/features/meilisearch.md)                                     | Meilisearch 가속 검색                                                        |
| [docs/features/webhooks-import-export-health.md](docs/features/webhooks-import-export-health.md) | 개인정보, 웹훅, WXR 가져오기/내보내기, 사이트 상태, 캐시                     |
| [docs/features/authoring-addresses.md](docs/features/authoring-addresses.md)                     | 확장된 작성 기능과 주소 규칙                                                 |
| [docs/operations.md](docs/operations.md)                                                         | 운영 실행, 설치 마법사, `.env` 없이 운영, 비밀 키                            |
