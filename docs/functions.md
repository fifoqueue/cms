# 사이트 함수

`FUNCTIONS_DIR`(기본 `apps/api/data/functions`)의 `site.ts`를 실행합니다.
파일이 없으면 아무것도 실행하지 않습니다. 플러그인 부팅 후 사이트 함수가 활성화됩니다.

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

`api`만 실행합니다. 소유자는 `functions:site`입니다. 컨텍스트는 플러그인과 같으며
훅은 trusted registrar를 사용합니다. 신뢰하는 서버 코드만 넣으세요. 임의 코드 실행이며
동기 무한 루프나 임의의 파일 접근을 차단하지 않습니다. 자체 타이머 같은 외부 자원은
만들지 마세요. 등록은 재로딩 때 scope가 해제합니다.

파일 감시는 150ms debounce, 공유 저장소 재검사는 10초입니다. SHA-256으로 변경을
판별하며 `.versions`에 별도 모듈을 생성합니다. 실패하면 마지막 성공 정의를 다시 활성화합니다.
현재 로드된 버전(복구용 마지막 성공 버전 포함)은 유지하고, 교체·실패한 버전은 import가
끝난 뒤 정리합니다. 각 스냅샷은 자신이 만든 파일만 삭제하므로 다른 API 인스턴스나
동시 import의 파일을 삭제하지 않습니다. 이전 구현이나 비정상 종료가 남긴 파일은
자동 삭제하지 않으며 모든 API 프로세스를 멈춘 상태에서 정리할 수 있습니다.
프로세스 재시작 후에는 메모리의 마지막 성공
정의가 사라지므로 잘못된 파일을 서버에서 수정해야 합니다.

편집기는 기본적으로 닫혀 있습니다. 서버에서 `FUNCTIONS_EDITOR_ENABLED=true` 또는
`FUNCTIONS_DIR/editor.enabled`를 만들어 허용합니다. 관리자 설정으로 변경할 수 없습니다.
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
이미지 정리·재인코딩 후 바이트의 해시가 아니라 업로드 입력의 해시입니다.
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

파일 확장자는 바이트에서 식별한 MIME에 맞게 코어가 고정합니다. 키는 상대 경로이며
각 세그먼트는 영숫자로 시작하고 영숫자·점·밑줄·하이픈만 허용합니다.
`..`, 역슬래시, 절대 경로는 허용하지 않습니다. 전체 255자, 세그먼트 128자 제한과
파생 이미지·충돌 접미사 공간을 검사합니다. 잘못된 반환값은 무시하고 이전 키를 유지합니다.
파생 이미지도 선택된 기본 이름을 사용합니다. 이미 저장된 파일은 이름을 바꾸지 않습니다.

관리자가 설치하는 테마 ZIP 루트에 선택 파일 `functions.ts`를 넣습니다. 하나의
최상위 폴더로 감싼 ZIP도 지원합니다. UTF-8 256KiB 이하이며 설치 전에 TypeScript
transpile 문법 검사를 합니다. 위와 같은 `export const functions = defineFunctions(...)`
계약을 사용하며 현재 `api`만 실행합니다. 별도 manifest 필드는 없습니다.
보조 모듈 파일은 추출하지 않으므로 자체 코드가 하나의 파일에 들어 있어야 합니다.

선언형 테마는 기존 `appearance.manage` 권한을 사용합니다. 함수가 있는 아카이브의
설치·업그레이드 및 함수가 있는 테마의 활성화에는 추가로 `functions.edit`가 필요합니다.
서비스와 HTTP 경로에서 권한 부족은 `403 forbidden`으로 거부합니다. **함수가 있는 테마 설치는 플러그인
업로드와 같은 서버 코드 실행 권한**입니다. 편집기 보안 게이트와 무관하며 sandbox가
아닙니다. 신뢰할 수 있는 관리자가 검토한 아카이브만 설치하세요.

소스는 테마 데이터와 동일한 공유 DB의 `themes` 설정 안에 저장되어 모든 API
인스턴스가 같은 활성 테마와 코드를 읽습니다. 공개/관리자 테마 DTO에는 포함하지 않습니다.
`PLUGINS_DIR`의 공유 저장소 요구와 달리 테마 소스에는 별도 공유 디렉터리가 필요하지
않습니다. 각 API의 `FUNCTIONS_DIR/.versions`에는 SHA-256 이름을 가진 실행용 사본만
생성합니다(디렉터리는 쓰기 가능해야 합니다).

실행 순서는 플러그인 → 활성 테마(`theme:<id>`) → 사이트(`functions:site`)입니다.
비활성 테마와 함수가 없는 내장 테마는 실행하지 않습니다. 활성화·전환·업그레이드·삭제는
로컬 인스턴스에서 즉시 재조정하고 다른 인스턴스는 10초 재검사로 반영합니다.
활성 테마 삭제는 conflict로 거부합니다. 먼저 다른 테마를 활성화해야 합니다.
함수 없는 업그레이드는 기존 함수를
해제합니다. 새 모듈을 비동기로 준비하는 동안 기존 훅을 유지하고 준비가 끝나면 등록을
동기적으로 교체합니다. 실패한 업그레이드는 같은 소유자의 기존 성공 scope를 그대로 유지하며 상태 API의
`sources`에 실패를 표시합니다. 다른 테마로 전환하면 이전 테마의 scope와 복구 후보를
해제합니다. 사이트와 같은 trusted registrar 및 버전 정리 규칙을 사용합니다.
