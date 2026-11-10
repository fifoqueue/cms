# 사이트 함수

`FUNCTIONS_DIR`(기본 `apps/api/data/functions`)의 `site.ts`를 실행합니다.
파일이 없으면 아무것도 실행하지 않습니다. 사이트 함수는 플러그인 부팅 후 활성화됩니다.

```ts
import { defineFunctions } from '@cms/sdk/functions';

export const functions = defineFunctions({
  api(ctx) {
    ctx.hooks.filter('content.public', (content) => ({
      ...content,
      meta: { ...content.meta, greeting: '안녕하세요' },
    }));
  },
});
```

API 서버는 `api`, 웹 서버는 `web`을 실행합니다. 소유자는 `functions:site`입니다. API 컨텍스트는 플러그인과 같으며
훅은 trusted registrar를 사용합니다. 신뢰하는 서버 코드만 넣으세요. 임의 코드를 직접 실행하며
동기 무한 루프나 임의의 파일 접근, 자체 타이머를 차단하거나 격리하지 않습니다. 자체 타이머 같은 외부 자원은
만들지 마세요. 재로딩하면 scope가 등록을 해제합니다.

파일 감시는 150ms debounce, 공유 저장소 재검사는 10초입니다. SHA-256으로 변경을
판별하며 `.versions`에 별도 모듈을 생성합니다. 실패하면 마지막 성공 정의를 다시 활성화합니다.
현재 로드된 버전(복구용 마지막 성공 버전 포함)은 유지하고 교체·실패한 버전은 import가
끝난 뒤 정리합니다. 각 스냅샷은 자신이 만든 파일만 삭제하므로 다른 API 인스턴스나
동시 import의 파일을 삭제하지 않습니다. 이전 구현이나 비정상 종료가 남긴 파일은
자동 삭제하지 않습니다. 모든 API 프로세스를 멈춘 상태에서 정리할 수 있습니다.
프로세스를 재시작하면 메모리의 마지막 성공 정의가 사라지므로 잘못된 파일을 서버에서 수정해야 합니다.

편집기는 기본으로 닫혀 있습니다. 서버에서 `FUNCTIONS_EDITOR_ENABLED=true`를 설정하거나
`FUNCTIONS_DIR/editor.enabled`를 만들어 허용합니다. 관리자 설정으로는 바꿀 수 없습니다.
`administrator` 역할과 `functions.edit` capability가 모두 필요합니다.

| 메서드 | 경로                             | 계약                                             |
| ------ | -------------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/admin/functions`        | `{ source }`                                     |
| POST   | `/api/v1/admin/functions`        | `{ source }` 문법 검사 → `{ valid: true }`       |
| PUT    | `/api/v1/admin/functions`        | `{ source }` 검사·원자적 저장·즉시 재로딩 → 상태 |
| GET    | `/api/v1/admin/functions/status` | 편집기 잠금과 무관하게 상태 조회                 |

소스는 UTF-8 256KiB 이하입니다. API는 기존 Bearer 인증을 사용합니다.
SDK `createAdminClient(...).functions`는 `read/status/validate/write`를 제공합니다.
상태는 `{ editorEnabled, checkedAt, sources: [{ owner, observedHash, loadedHash, lastError, updatedAt }] }`입니다.
실패 상세는 서버 로그에만 기록합니다. `lastError`는 `activation_failed` 또는
`recovery_failed`이며 정상일 때 `null`입니다.

## 테마 함수

### 업로드를 SHA-256 이름으로 저장하기

다음 코드는 원본 업로드 바이트의 SHA-256을 표시 이름과 실제 저장 키에 사용합니다.
이미지 정리·재인코딩 뒤 바이트의 해시가 아니라 업로드 입력의 해시입니다.
같은 콘텐츠를 다시 업로드하면 `-1`, `-2` 접미사로 구분합니다.
`media.filename`만으로는 실제 URL이 바뀌지 않습니다.

```ts
import { createHash } from 'node:crypto';
import { defineFunctions } from '@cms/sdk/functions';

export const functions = defineFunctions({
  api(ctx) {
    ctx.hooks.filter('media.filename', (_name, { bytes }) =>
      createHash('sha256').update(bytes).digest('hex'),
    );
    ctx.hooks.filter('media.storageKey', (value, { bytes }) => ({
      ...value,
      basename: createHash('sha256').update(bytes).digest('hex'),
    }));
  },
});
```

코어가 바이트에서 식별한 MIME에 맞춰 파일 확장자를 고정합니다. 키는 상대 경로이며
각 세그먼트는 영숫자로 시작하고 영숫자·점·밑줄·하이픈만 허용합니다.
`..`, 역슬래시, 절대 경로는 허용하지 않습니다. 전체 255자, 세그먼트 128자 제한과
파생 이미지·충돌 접미사가 들어갈 공간을 검사합니다. 잘못된 반환값은 무시하고 이전 키를 유지합니다.
파생 이미지도 선택된 기본 이름을 사용합니다. 이미 저장된 파일은 이름을 바꾸지 않습니다.

관리자가 설치하는 테마 ZIP 루트에 선택 파일 `functions.ts`를 넣습니다. 최상위 폴더
하나로 감싼 ZIP도 지원합니다. UTF-8 256KiB 이하이며 설치 전에 TypeScript
transpile 문법 검사를 합니다. 위와 같은 `export const functions = defineFunctions(...)`
계약을 사용하며 API 서버에서 `api`, 웹 서버에서 `web`을 실행합니다. 별도 manifest 필드는 없습니다.
보조 모듈 파일은 추출하지 않으므로 자체 코드를 파일 하나에 담아야 합니다.

선언형 테마는 기존 `appearance.manage` 권한을 사용합니다. 함수가 있는 아카이브를
설치·업그레이드하거나 함수가 있는 테마를 활성화하려면 `functions.edit`도 필요합니다.
권한이 부족하면 서비스와 HTTP 경로 모두 `403 forbidden`으로 거부합니다. **함수가 있는 테마 설치는 플러그인
업로드와 같은 서버 코드 실행 권한**입니다. 편집기 보안 게이트와 무관하며 sandbox가
아닙니다. 신뢰할 수 있는 관리자가 검토한 아카이브만 설치하세요.

소스는 테마 데이터와 같은 공유 DB의 `themes` 설정 안에 저장하므로 모든 API
인스턴스가 같은 활성 테마와 코드를 읽습니다. 공개/관리자 테마 DTO에는 포함하지 않습니다.
`PLUGINS_DIR`의 공유 저장소 요구와 달리 테마 소스에는 별도 공유 디렉터리가 필요하지
않습니다. 각 API의 `FUNCTIONS_DIR/.versions`에는 SHA-256 이름의 실행용 사본만
생성합니다(디렉터리는 쓰기 가능해야 합니다).

실행 순서는 플러그인 → 활성 테마(`theme:<id>`) → 사이트(`functions:site`)입니다.
비활성 테마와 함수가 없는 내장 테마는 실행하지 않습니다. 활성화·전환·업그레이드·삭제는
로컬 인스턴스에서 즉시 재조정하고 다른 인스턴스는 10초 재검사로 반영합니다.
활성 테마 삭제는 conflict로 거부하므로 먼저 다른 테마를 활성화해야 합니다.
함수 없는 업그레이드는 기존 함수를 해제합니다. 새 모듈을 비동기로 준비하는 동안 기존 훅을 유지하고 준비가 끝나면 등록을
동기적으로 교체합니다. 업그레이드가 실패하면 같은 소유자의 기존 성공 scope를 유지하고 상태 API의
`sources`에 실패를 표시합니다. 다른 테마로 전환하면 이전 테마의 scope와 복구 후보를
해제합니다. trusted registrar와 버전 정리 규칙은 사이트와 같습니다.

## 웹 함수

```ts
import { defineFunctions } from '@cms/sdk/functions';

export const functions = defineFunctions({
  web(ctx) {
    ctx.hooks.filter('page.bodyClasses', (classes) => [...classes, 'my-site']);
    ctx.hooks.filter('response.headers', (headers) => ({
      ...headers,
      'x-site-render': 'enabled',
    }));
    ctx.slots.provide('body.open', () => '<p>환영합니다</p>');
    ctx.assets.register({
      key: 'site-style',
      kind: 'style',
      src: '/site.css',
      placement: 'head',
      attrs: {},
    });
  },
});
```

웹 서버의 시작 훅이 로더를 시작합니다. 활성 테마, 사이트 순서로 활성화하며
성공한 scope의 등록만 공개합니다. 모듈 import나 활성화가 실패하면 마지막 성공 scope를
유지합니다. 훅 예외와 잘못된 반환값은 서버 로그에 기록하고 이전 값을 사용합니다.
`ctx.page`는 렌더 작업 안에서만 읽을 수 있는 요청별 컨텍스트이며 활성화 시에는
`undefined`입니다. 콜백의 두 번째 인자에도 읽기 전용 페이지 컨텍스트를 전달합니다.
라우트 등록 기능은 없습니다.

| 훅                    | 필터 값                                                     |
| --------------------- | ----------------------------------------------------------- |
| `template.candidates` | 템플릿 후보 이름 배열                                       |
| `page.bodyClasses`    | CSS 클래스 배열                                             |
| `page.data`           | `filterPageData`가 경로별 DTO 스키마로 검증하는 공개 데이터 |
| `page.head`           | 허용된 속성만 가진 `meta`/`link` 객체 배열                  |
| `response.headers`    | 응답 헤더 객체                                              |
| `assets`              | 스크립트/스타일 자산 배열                                   |

`hooks.filter(name, callback, priority?)`와 `hooks.on(name, callback, priority?)`는
해제 함수를 반환합니다. 기본 우선순위는 10이며 작은 값부터 실행합니다.
`on`은 검증된 최종 값을 관찰하며 반환값은 쓰지 않습니다.
공개 페이지의 슬롯 로딩은 표현 훅을 적용합니다. `page.data`는 `filterPageData`에서
템플릿과 SEO를 계산하기 전에 적용합니다. 이 함수는 페이지 종류에 맞는
`webPageDataSchemas`의 스키마로 공개 DTO를 투영하고 반환값을 같은 DTO 스키마로 다시 검증합니다.
스키마는 기존 API DTO의 필드에서 파생하며 호출자가 임의 스키마를 제공하지 않습니다.
슬롯·세션·폼 상태는 변경할 수 없습니다. 잘못된 값은 경고를 기록하고 이전 값을
유지합니다. 핸들러가 없으면 DTO 복제나 스키마 검증을 하지 않습니다.

### 전달과 재로딩

`GET /api/v1/internal/functions`는 `SSO_FRONTEND_SECRET_HEADER`의 프런트엔드
비밀로 인증합니다. 일반 공개 클라이언트에 소스를 노출하지 않습니다.
응답은 `{ version, sources: [{ owner, hash, code }] }`이며 테마가 먼저입니다.
전체 모듈을 전달하지만 웹 로더는 `web`만 실행합니다. 해시는 SHA-256입니다.
응답의 ETag는 따옴표로 감싼 version이며 `If-None-Match`가 같으면 인증 후 304를
반환합니다. 캐시 정책은 `private, no-store`입니다.

웹은 10초마다 조건부 요청을 보내며 HTTP 요청 제한 시간은 5초입니다.
소스는 웹 작업 디렉터리의 `data/functions/.versions` 아래에 해시 접두사가 붙은 고유 이름의
스냅샷 디렉터리로 저장하고 `@cms/sdk/*`를 해석해 번들링합니다.
유지 중인 해시는 한 번만 import합니다. 교체에 성공하면 현재 버전과 직전 성공
버전의 파일만 유지하고 더 오래된 스냅샷은 import가 끝난 뒤 정리합니다.
로더는 자신이 생성한 고유 디렉터리만 삭제하므로 다른 웹 인스턴스나 진행 중인 다른
import의 파일을 삭제하지 않습니다. 로더의 `stop()`은 자신의 스냅샷을 모두 정리합니다.
실패한 import는 캐시에서 제거하고 자신의 파일을 정리합니다. 같은 해시도 다음
재검사에서 고유 경로로 다시 시도하므로 일시적인 파일 오류에서 복구할 수 있습니다.
프로세스를 재시작하면 메모리의 마지막 성공
scope가 사라집니다. 이전 구현이나 비정상 종료가 남긴 파일은 자동 삭제하지 않습니다.

### 출력과 제한

공개 요청의 page-render RPC는 요청 안에서 공유하며 실패하면 빈 슬롯·클래스·자산·
헤더·후보 목록으로 계속 렌더링합니다. 웹 표현 훅은 API 결과 뒤에 실행합니다.
키가 같은 자산은 웹 등록이 우선합니다. 자산 URL은 HTTP(S) 또는 같은 사이트의
절대 경로를 사용합니다. 속성은 이스케이프하며 제공된 SRI와 crossorigin을 보존합니다.
CSP에는 자산 종류의 출처만 추가하고 다른 지시문은 넓히지 않습니다.
캐시·쿠키·인증·보안 정책 헤더는 표현 훅이 덮어쓸 수 없습니다.

자산과 head 항목은 각각 최대 128개입니다.
슬롯 HTML에서는 실행 가능한 태그·이벤트 속성·위험한 URL을 제거합니다.
head 슬롯은 meta/link만 허용하며 스타일시트와 스크립트는 자산으로 등록합니다.
meta는 description·author·keywords·generator·application-name·theme-color·color-scheme과
og:/twitter: 정보만 허용합니다. referrer·robots·http-equiv 정책은 변경할 수 없습니다.
콘텐츠 미리보기도 page-render를 한 번 조회해 슬롯과 표현 훅을 적용하며
캐시 금지·검색 제외·리퍼러 차단 정책을 유지합니다. 설정된 공개 로그인 경로는
자격 증명 화면이므로 예외입니다. 이 경로에서는 page-render와 웹 표현 훅을 실행하지 않고
모든 슬롯을 명시적으로 비웁니다.
