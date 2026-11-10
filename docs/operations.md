# 운영·환경 설정

## 미디어 저장소 운영

마이그레이션 `20261114000000_media_storage`는 로컬 URL과 원본 바이트 수를 채웁니다. 이전 버전의 변환본(variant) 바이트 수는 다시 동기화(resync)하기 전까지 null로 남습니다. MariaDB, 로컬 미디어, 사이트의 비밀 키를 함께 백업하세요.

### 미디어 키 인덱스의 다중 인스턴스 배포

`20261122000000_media_storage_keys`는 `CREATE TABLE IF NOT EXISTS`만 실행합니다.
DDL 배포 중에 media/variants/settings 데이터 전체를 스캔하거나 잠그지 않습니다.
MariaDB의 암묵적 DDL 커밋 이후 중단되어도 테이블을 삭제하지 않고 같은 DDL을 재실행할 수 있습니다.
Prisma가 실패 상태를 기록했다면 실제 테이블 정의를 확인한 뒤 해당 마이그레이션을
`prisma migrate resolve --rolled-back 20261122000000_media_storage_keys`로 정리하고
일반 migrate deploy 절차를 다시 실행합니다. 이미 성공한 이력을 임의로 되돌리지 마세요.

새 API는 부팅 때 `core:media-key-catch-up`을 한 번 요청하고 이후 5초 주기 작업으로
계속 실행합니다. 실제 실행 시점은 스케줄러 실행 간격(tick)을 따릅니다.
여러 인스턴스 중 하나만 실행하도록 기존 DB 작업 임대(task lease)가 조정합니다.
예약 네임스페이스는 `media_storage_keys` 테이블 하나이며 고유 제약으로 보호합니다.
한 번에 PK 순서로 media 100개까지 처리합니다. 순회를 시작할 때 최대 ID를 상한으로
고정해 커서와 함께 영속화합니다. 상한까지 처리하면 배치가 100개여도 처음으로 돌아갑니다.
처리 도중 더 큰 ID가 계속 추가되어도 현재 순회가 무한히 연장되지 않습니다.
따라서 배포 이후 구버전 API가 삽입한 행이나 커서보다 작은 ID도 다음 순회에 포함됩니다.
행별 트랜잭션은 소유권을 확인한 뒤 원본·파생 키를 연결합니다. 중단된 뒤 마지막 배치를
다시 실행해도 다른 미디어의 키를 덮어쓰지 않습니다.
소유권 충돌·손상된 예약은 작업 오류로 남길 뿐 자동으로 다른 소유자로 바꾸지 않습니다.
사이트 작업 상태와 서버 로그의 `core:media-key-catch-up` 오류를 확인하세요.

인덱스에 없으면 원본은 storage_key 고유 인덱스로 조회해 문자열을 정확히 비교합니다.
구버전의 `YYYY/MM/<UUID>-<size>.webp` 파생 키는 UUID PK로 media 한 행만 읽습니다.
그 행의 variants에서 정확히 비교하고 소유권을 검증한 뒤 매핑합니다.
요청마다 전체 JSON 테이블을 검색하지 않습니다. 임의 이름의 기존 파생 파일은 배치가
해당 행을 방문하기 전까지 일시적으로 조회되지 않을 수 있습니다. 대규모 라이브러리라면
읽기 트래픽을 전환하기 전에 catch-up이 한 순회를 마치게 하세요.
구버전 쓰기 인스턴스를 동시에 모두 내릴 필요는 없습니다.
다만 구버전 읽기 인스턴스는 새 저장 키 형식을 이해하지 못합니다. 새 파일 URL이 그 인스턴스로
가지 않게 라우팅하거나, 파일 이름 변경 훅은 읽기 인스턴스를 교체한 뒤에 활성화하세요.
실패·삭제 예약은 계속 유지하세요. 테이블/커서를 수동으로 삭제해 키를 재사용하지 마세요.

저장소 설정은 환경변수 전용 설정이 아니라 관리자가 관리하는 `media.storage` 값입니다. S3 비밀 값은 `SecretBox`로 봉인되며 다시 반환되지 않습니다. 어댑터는 SigV4 서명에만 `aws4fetch`를 씁니다. 확인(probe)·업로드·읽기·삭제·페이지 단위 목록 조회는 모두 egress 전송을 사용하며 이 전송은 서비스 `media-storage`로 DNS를 고정합니다. 사설 MinIO 엔드포인트를 쓰려면 그 서비스의 호스트/포트/주소 egress 규칙을 명시해야 합니다. 서명된 자격 증명이 전달되지 않도록 리디렉션은 거부되므로 올바른 리전 엔드포인트를 설정하세요. AWS, R2, MinIO, B2, Wasabi는 엔드포인트/리전/버킷을 설정하고, 각 제공자의 리전 및 path-style 요구 사항을 따릅니다. 확인에는 PutObject/DeleteObject, 전송에는 GetObject, 다시 동기화에는 접두사 아래의 ListBucket이 필요합니다.

기존 자산이 그 위치에 의존하므로 한 번 정한 S3 엔드포인트/버킷/접두사는 그 자리에서 바꿀 수 없습니다. 로컬/S3 전환은 이 설정을 보존하며, 자격 증명 교체는 지원합니다. 기존 객체를 다른 버킷/제공자로 옮기는 일은 자동으로 되지 않고 후속 마이그레이션 작업으로 남아 있습니다. CDN 변경은 새 업로드와 다시 동기화로 갱신된 URL에만 영향을 줍니다. 저장된 콘텐츠에 이미 삽입된 URL은 그대로입니다.

상위 문서: [AGENTS.md](../AGENTS.md)

## 공개 HTML 압축과 캐시

리버스 프록시에서 HTML에 gzip 또는 Brotli를 적용하세요. 응답에
`Content-Encoding: gzip` 또는 `br`와 `Vary: Accept-Encoding`이 있어야 합니다.
Nginx에서는 `gzip on; gzip_vary on;`으로 HTML 압축을 켤 수 있습니다.
`gzip_types text/css application/javascript application/json application/xml;`은
추가 형식을 지정합니다. HTML은 기본 대상입니다. Brotli는 해당 모듈을 설치한
프록시에서 설정하세요. 이미 압축된 이미지·폰트를 다시 압축하지 마세요.

공개 HTML은 기본적으로 `public, max-age=0, must-revalidate`이며 전체 렌더링
결과의 약한 ETag와 Last-Modified를 보냅니다. If-None-Match가 일치하면 GET과
HEAD 모두 본문 없는 304를 반환합니다. Last-Modified는 프로세스의 제한된
관측 기록일 뿐 템플릿·플러그인 전체의 권위 있는 수정 시각이 아닙니다. 그래서
If-Modified-Since만 있는 요청은 다시 렌더링한 200을 받습니다.
HTML 응답은 검증자를 계산하려고 완성한 뒤에 전송합니다.

읽기 설정 `cacheSeconds`를 0보다 크게 설정하기 전에 CDN/프록시에서
다음 쿠키가 있는 요청의 캐시 조회와 저장을 모두 우회해야 합니다:
`cms_session`, `__Host-cms_session`, `cms_sso`, `__Host-cms_sso`,
`cms_signed_out`, `__Host-cms_signed_out`, `cms_theme_preview`,
`cms_commenter`, `cms_commenter_proof`, `cms_unlock_*`, `cms_pending_*`.
Authorization 헤더가 있는 요청도 우회하고 Set-Cookie 및 private/no-store
응답을 저장하지 마세요. 원본 서버에서 개인화 요청을 no-store로 처리하는 것만으로는
이미 CDN에 저장된 익명 응답의 재사용을 막을 수 없습니다. 분석 쿠키는 우회
목록에 넣지 않습니다. HTTP Vary는 개별 쿠키 이름을 지원하지 않으므로
공개 HTML에 `Vary: Cookie`를 추가하지 않습니다.
이 우회 정책을 적용할 수 없으면 `cacheSeconds=0`을 유지하세요.

읽기 설정의 `canonicalOrigin`은 기본 false입니다. 관리자 설정 → 읽기의
“사이트 주소로 이동”을 켜면 공개 GET/HEAD가 SEO의 `siteUrl` 출처로 301 이동합니다.
관리자·설치·미리보기·로그인·상태 확인 경로는 대상이 아닙니다.
경로와 쿼리는 그대로 유지합니다. 훅은 임의의 X-Forwarded-* 헤더를 신뢰하지
않고 SvelteKit 어댑터가 해석한 요청 출처만 사용합니다. 어댑터의
PROTOCOL_HEADER/HOST_HEADER를 사용하는 배포에서는 신뢰할 프록시만 서버에
접속할 수 있게 하고 프록시가 전달 헤더를 덮어쓰게 하세요.
공개 origin을 제대로 전달하지 않으면 HTTPS 리디렉션 루프가 생길 수 있습니다.

### 공개 경로 및 이미지 메타데이터 마이그레이션

`20261127000000_public_paths_images`는 `content_paths.folded_hash`와 색인,
`content_tombstones` 테이블, 미디어 public_url 접두사 색인을 추가합니다.
새 API를 시작하기 전에 일반 `db:migrate` 절차로 적용하세요.
경로를 바꾸거나 콘텐츠를 삭제하지 않습니다. folded_hash의 DB 기본 식은 기존
경로를 채우고 이 필드를 모르는 작성자의 새 행도 계산합니다. 경로 행은 주소 변경 때
새로 삽입되므로 오래된 folded_hash를 재사용하지 않습니다.
경로/미디어 테이블이 크면 색인 생성에 쓸 유지보수 시간과 디스크 여유를 확보하세요.
이전 API로 되돌려도 조회는 됩니다. 다만 그 버전은 삭제할 때 tombstone을 기록하지 않으므로
복구 기간에는 영구 삭제를 중지하세요. 백업에 새 테이블도 포함합니다.

`20261128000000_path_publication`은 경로와 tombstone 각각에 공개 이력 표식을
추가합니다. 기존 스키마는 초안 중에 만든 주소와 실제 공개 주소를 구별할 수 없으므로,
현재 발행 상태이고 휴지통에 없는 글의 경로만 검증합니다. 기존 초안/휴지통 경로 및
이전 tombstone은 삭제하지 않습니다. 다만 공개 이력이 불확실하므로 410 대신 404를 반환합니다.
향후 공개 쓰기에서 검증된 주소는 다시 410 이력을 남길 수 있습니다.
이 마이그레이션과 새 API는 함께 배포하세요. 이전 API 프로세스는 공개 여부를 글 단위로
추측했으므로 이 프로세스에는 트래픽을 보내지 마세요.

이전 공개 이력을 복구하려면 검증된 공개 URL 목록이나 당시 DB 백업/변경 로그가 필요합니다.
현재 `content_revisions`는 제목·요약·문서만 기록하며 당시 상태나 고유주소를 기록하지
않습니다. 이전 `content_paths`에는 생성/공개 시각이 없고, tombstone에는 소유자나
삭제 당시 상태가 없습니다. 따라서 현재 초안/휴지통 상태나 최초 발행 시각만으로
이전 모든 주소를 공개로 표시하면 초안 주소를 다시 노출할 수 있습니다.
확인되지 않은 주소를 일괄 410으로 바꾸지 마세요.

### 잠금 해제 응답의 캐시

잠금 해제 쿠키가 있는 요청은 HTML뿐 아니라 `__data.json`과 기타 응답도
`private, no-store`이며 `Vary: Cookie`를 포함합니다. proof 헤더를 직접 받으면
그 헤더도 Vary에 포함합니다. API에서 proof를 지원하는 콘텐츠 읽기는
`Vary: x-cms-unlock`을 보냅니다. 주소 해석은 Authorization도 포함합니다. proof 요청에는
응답 형식이나 플러그인이 기여한 헤더와 관계없이 `private, no-store`를 강제합니다.
이전에 공개 캐시가 적용되었을 수 있는 페이지 데이터와 API 응답은 배포 때
CDN/리버스 프록시에서 제거하세요. 기존에 저장된 사본은 원본 헤더 수정만으로
즉시 회수할 수 없습니다.
`__data.json` 자체도 익명 여부와 관계없이 공유 캐시에서 제외합니다.
자격 증명이 있는 GET/HEAD는 If-None-Match와 If-Modified-Since를 내부 처리기에
전달하지 않습니다. 비공개 응답은 확장 헤더 처리 뒤 ETag와 Last-Modified를 제거하며
304를 반환하지 않습니다. 내부 처리기가 조건 없이 304를 반환하면 본문을 복구할 수
없습니다. 이때는 빈 성공 응답으로 바꾸지 않고 캐시 불가능한 500으로 거부합니다.

## 공개 페이지의 Content-Security-Policy

앱은 공개 페이지에서 `script-src`, `style-src`, `font-src`를 보내지 않습니다. HTML 응답에는 `frame-ancestors`(관리자와 로그인은 `'none'`, 공개 페이지는 사이트 편집기 미리보기를 위해 `'self'`)와 같은 뜻의 `X-Frame-Options`, 그리고 `Cross-Origin-Opener-Policy: same-origin`만 보냅니다. 리버스 프록시가 이런 정책을 추가한다면 다음을 허용하세요.

- 첫 렌더링 전에 방문자의 라이트/다크 선택을 복원하는 인라인 head 스크립트, 그리고 대체 팔레트, 사이트 글꼴 `@font-face` 규칙을 위한 인라인 `<style>` 요소. 이들은 테마 설정에 따라 바뀌며 nonce나 해시를 갖지 않습니다. 그래서 엄격한 정책에서는 `'unsafe-inline'`이 필요하며 그렇지 않으면 테마의 색상 모드 전환과 사이트 글꼴을 쓰지 말아야 합니다.
- 공개 테마 CSS는 동일 출처 `/preview/theme/style.css?v=<SHA-256>`에서 로드하므로 `style-src 'self'`를 허용하고 이 경로는 웹 서버로 전달하세요. 일치하는 해시는 1년 immutable, 불일치는 no-cache, 테마 미리보기는 private, no-store입니다. 관리자 사이트 편집기는 계속 인라인 CSS를 사용합니다.
- 테마 → 편집기 → 스타일에서 추가한 사이트 글꼴의 출처: `style-src`에는 스타일시트 호스트(예: `https://fonts.googleapis.com`), `font-src`에는 글꼴 파일 호스트(예: `https://fonts.gstatic.com`). 미디어 라이브러리에 업로드한 글꼴은 동일 출처입니다.

## 실행과 배포

### Docker Compose로 로컬 실행

```bash
docker compose up -d --build
docker compose logs api
```

웹은 `http://127.0.0.1:3000`, API는 `http://127.0.0.1:4000`, MariaDB는
`127.0.0.1:3306`, Meilisearch는 `http://127.0.0.1:7700`에서만 호스트에 공개됩니다.
`WEB_PORT`, `API_PORT`, `MARIADB_PORT`, `MEILI_PORT`로 호스트 포트를 바꿔도
바인딩 주소는 `127.0.0.1`로 유지됩니다. 컨테이너 안에서는 다른 컨테이너와
Docker 포트 전달을 받기 위해 `0.0.0.0`에서 수신합니다. 외부 인터페이스에
호스트 포트를 공개하는 설정은 아닙니다. 아웃바운드 인터넷 연결은 제한하지 않습니다.

API 로그의 설치 키로 `/admin/setup`을 열고, DB 호스트 `mariadb`, 포트 `3306`,
DB·사용자·비밀번호 `cms`를 입력합니다. 컨테이너 간 연결에는 호스트에 공개한
포트 대신 서비스 이름과 컨테이너 포트를 사용합니다. `.env`는 필요하지 않습니다.

API·웹은 `bun` 사용자, MariaDB `12.3.3-ubi`는 `mysql` 사용자,
Meilisearch `v1.55.0`은 UID/GID `1000:1000`으로 실행됩니다. 모든 서비스에서
Linux capability를 제거하고 `no-new-privileges`를 적용합니다. API의 설정·비밀 키·
미디어·플러그인은 `api-data`, 웹의 방문자 증명 비밀은 `web-data`, DB와 검색 색인은
각각 `mariadb`, `meilisearch` named volume에 보존됩니다. 이미지에는 로컬 `.env`,
`data`, 기존 빌드 결과를 넣지 않습니다.

여기서 비루트 실행은 컨테이너 프로세스에 적용됩니다. Docker 데몬까지 비루트로
실행하려면 호스트에 [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)를
설정하고 해당 context에서 같은 Compose 명령을 실행하세요. Dockerfile이나
Compose가 호스트 데몬을 rootless로 전환하지는 않습니다.

Meilisearch는 관리자 **설정 → 검색**에서 `http://meilisearch:7700`과
기본 키 `cms-local-search-key`로 연결합니다. `MEILI_MASTER_KEY`를 재정의했다면
그 값을 입력하세요. 사설 주소 접근은 **설정 → 아웃바운드 접근**에서 서비스
`search`, 호스트 `meilisearch`, 포트 `7700`, 해당 Docker 네트워크의 CIDR을
명시적으로 허용해야 합니다. 네트워크 CIDR은 아래 명령으로 확인합니다.

```bash
docker inspect "$(docker compose ps -q meilisearch)" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{println}}{{end}}'
docker network inspect <위에서-확인한-네트워크> --format '{{range .IPAM.Config}}{{.Subnet}}{{println}}{{end}}'
```

DB 비밀번호와 검색 키 기본값은 로컬 실행용입니다. 기존 MariaDB 11 볼륨을
사용한다면 12.3으로 시작하기 전에 DB와 `api-data`를 백업하고 별도 볼륨에서
업그레이드를 검증하세요. 이 구성은 기존 볼륨을 삭제하거나 자동 업그레이드하지 않습니다.
호스트에서 `bun run dev`로 개발할 때는 `docker compose up -d mariadb meilisearch`로
의존 서비스만 시작합니다.

플러그인의 일회성 잡은 코어 큐와 지수 백오프 재시도 정책을 공유합니다. 지연 잡을 포함해 페이로드는 항상 사이트의 비밀 키로 봉인됩니다. 플러그인을 비활성화하면 그 핸들러가 해제되므로 큐에 있던 잡은 알 수 없는 종류로 실패합니다. 비밀 키는 데이터베이스 백업과 함께 보관하세요.

로그인 예약/바인딩 마이그레이션은 `20261112000000_passkey_discoverable` 다음의 `20261113000000_sign_in_reservations`입니다. 이전의 임시 예약 타임스탬프는 배포하면 안 됩니다. 업데이트된 API를 실행하기 전에 Prisma를 생성하고 마이그레이션을 적용하세요. 관리형 SSO 제공자는 기존 `/admin/sso/callback` 등록을 유지하고, 환경변수 제공자는 계속 `OIDC_REDIRECT_URI`를 씁니다. 플러그인 리디렉션 방식은 `/admin/sign-in/callback`을 씁니다.

운영 실행은 루트의 `ecosystem.config.cjs`(pm2)를 씁니다: `bun install` → `bun run --filter @cms/api db:generate` → `bun run --filter @cms/web build` → `pm2 start ecosystem.config.cjs` (API :4000, 웹 :3000, 둘 다 기본 `127.0.0.1`에서만 수신 — 앞에 https 리버스 프록시를 둡니다). `.env`는 필요 없습니다.

웹 빌드는 `../board`처럼 릴리스로 승격합니다. `bun run --filter @cms/web build`는 `vite build` 뒤에 `apps/web/scripts/release.js`를 실행해 `build/`를 `apps/web/.web-releases/<내용 해시>/`로 복사하고 `.active-web-release`가 그것을 가리키게 합니다. `server.js`는 활성 릴리스에서 시작하므로, 다시 빌드해도 실행 중인 서버의 파일은 바뀌지 않습니다. 새 릴리스는 `pm2 restart cms-web`부터 적용됩니다. 12시간 안에 물러난 릴리스의 해시된 브라우저 에셋은 남아 있는 릴리스에 하드 링크로 이어 붙이므로 이미 열린 페이지도 스크립트를 불러옵니다. 그보다 오래된 릴리스는 다음 승격 때 지웁니다. 압축(.br/.gz)은 만들지 않습니다. 압축은 리버스 프록시가 합니다. `server.js`는 `X-Forwarded-Proto`가 없는 직접 연결에 실제 스킴을 채웁니다. 그래서 http로 접속해도 폼 전송이 CSRF 검사(403)에 막히지 않습니다. 리버스 프록시는 `X-Forwarded-Proto`를 넘겨야 합니다. 방문자 주소(속도 제한, 댓글 IP)도 기본으로 `X-Forwarded-For`에서 읽습니다(`ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`: 가장 가까운 프록시가 덧붙인 맨 오른쪽 값). 프록시가 여러 단(예: CDN → nginx)이면 `XFF_DEPTH`를 그 수로 올리고, `CF-Connecting-IP`·`X-Real-IP`만 보내는 프록시라면 `ADDRESS_HEADER`를 그 이름으로 바꿉니다. 헤더 없이 직접 들어온 연결은 소켓 주소를 씁니다. 웹 서버는 기본으로 127.0.0.1에서만 받으므로 이 헤더는 로컬 프록시만 넣을 수 있습니다. `WEB_HOST`를 공개 주소로 열고 프록시 없이 쓸 때는 `ADDRESS_HEADER=`(빈 값)로 꺼야 주소를 위조할 수 없습니다.

**`.env`는 루트 하나만 씁니다**(`.env.example` 참고, 앱별 `.env` 없음). API·웹 실행 스크립트와 pm2는 `bun --env-file=../../.env`로, 웹 개발 서버와 SvelteKit은 `env.dir`로, Prisma CLI는 `prisma.config.ts`로 이 파일을 읽습니다. 이미 설정된 환경변수가 우선합니다. 두 서버가 같은 파일을 읽으므로 포트·주소는 `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`로 나눕니다. 웹은 `CMS_API_URL`이 없으면 `http://127.0.0.1:<API_PORT>`로 API를 찾습니다.

## 설치 마법사와 설정 저장

첫 접속은 `/admin/setup`으로 안내됩니다. API 콘솔의 설치 키와 MariaDB 접속 정보를
입력하면 연결 확인·마이그레이션·설정 저장이 자동으로 진행됩니다. 로컬 Docker 기본값은
호스트 `localhost`, 포트 `3306`, DB/사용자/비밀번호 `cms`입니다. 운영에서는 미리 생성한
별도의 DB와 테이블 생성 권한이 있는 계정을 사용하고 HTTPS로 설치하세요.
다음 단계에서 사이트 정보와 첫 관리자 계정을 만들면 자동 로그인되고 재설치는 차단됩니다.
설치 완료 시 웹에서 접속한 origin을 검증해 SEO의 사이트 URL로 함께 저장합니다. 이후 관리자 SEO 설정에서 변경할 수 있습니다.
DB/사용자 자체를 생성하거나 기존 데이터를 초기화하지는 않습니다.

접속 정보는 `apps/api/data/config.json`에 저장되므로 `.env`를 편집할 필요가 없습니다.
이 파일은 비밀번호를 포함하므로 공개하지 말고 DB와 함께 백업하세요. Unix에서는 파일
권한 `0600`으로 생성하며, Windows에서는 서비스 계정만 읽도록 폴더 ACL을 설정하세요.
설치 키는 재시작할 때 바뀌며 설치가 끝나지 않았을 때만 콘솔에 표시됩니다.
중간에 중단한 설치는 저장된 DB 설정으로 이어갑니다. DB 연결 장애나 손상된 설정은
새 설치로 취급하지 않습니다. 기존 `DATABASE_URL` 환경변수는 저장된 파일보다 우선하고,
다른 고급 환경변수도 유지됩니다. 시작 시 마이그레이션이 자동 적용됩니다.

## `.env` 없이 운영하기

**`.env` 없이 운영할 수 있어야 합니다(WordPress의 `wp-config.php`처럼 선택 사항).** 사이트 운영에 필요한 설정은 모두 관리자 화면에 있습니다: DB 접속(설치 마법사), 메일, 캡차·속도 제한, 싱글 사인온, Meilisearch, 페이지 캐시(설정 → 읽기) 등. 새 설정을 추가할 때도 env 전용으로 만들지 말고 `settings`에 저장하는 관리자 설정으로 만듭니다. 비밀 값은 `SecretBox`로 봉인합니다. 환경변수는 기본값을 바꾸는 선택적 재정의로만 둡니다.

- `bun run --filter @cms/web start`(`apps/web/server.js`)는 업로드를 위해 `BODY_SIZE_LIMIT`을 기본 64MB로 두되, 훅이 일반 폼 64KB·콘텐츠 2MB·플러그인 6MB·WXR 17MB로 먼저 제한합니다. API JSON은 기본 512KB(공개 인증·댓글 32KB, 콘텐츠 1MB), WXR은 16MB입니다.
- 웹 시작 시 루트 `.env`를 읽은 뒤 DB 주소·API 비밀 키·OIDC 클라이언트 비밀 같은 API 전용 변수를 제거하고 앱을 불러옵니다. 웹 런타임에는 `WEB_*`, `CMS_API_URL`, 방문자 증명 비밀 등 필요한 값만 남아야 합니다.
- 비밀 키는 자동입니다. `CMS_SECRET_KEY`가 없으면 `apps/api/data/secret.key`를 만들어 씁니다. 이 파일은 DB와 함께 백업하세요. API 인스턴스가 여러 개면 같은 값을 공유하세요. 키를 바꿀 때는 모든 인스턴스에 새 `CMS_SECRET_KEY`와 이전 `CMS_SECRET_KEY_PREVIOUS`를 함께 설정합니다. 이전 키를 없애기 전에 대기 중인 잡을 모두 처리하고 저장된 비밀 값을 관리자 화면에서 다시 입력해 저장하세요. 웹훅 비밀은 회전하세요.
- 비밀번호 재설정·가입·초대 링크를 포함한 이메일 잡 본문은 `SecretBox`로 봉인해 저장합니다. 최종 실패한 잡은 본문을 즉시 지우되, 키가 달라 열 수 없는 암호문은 키 복구를 위해 보존하고 매시간 다시 확인합니다. 기존 실패 잡의 평문도 유지보수 작업이 회당 500개씩 지웁니다. 실패 기록은 30일 뒤 정리합니다.
- **이메일 잡 형식 업그레이드는 롤링 배포하지 않습니다.** 이전 API 프로세스를 모두 중지한 뒤 새 버전을 모두 시작하세요. 새 프로세스는 기존 평문 잡을 읽지만, 이전 프로세스는 새 암호화 봉투를 읽지 못합니다. 이전 버전으로 되돌리기 전에는 새 버전으로 암호화 잡을 비우거나 새 리더를 유지해야 합니다.
- 웹↔API 방문자 증명 비밀은 비밀 키에서 파생됩니다. 관리자가 로그인하면 웹 서버가 `GET /api/v1/admin/frontend-secret`으로 받아 `apps/web/data/frontend.secret`(0600)에 보관합니다. 그 전까지 방문자는 공용 할당량을 나눠 씁니다. 두 서버에 같은 `CMS_FRONTEND_SECRET`(32자 이상)을 두면 이 과정을 건너뜁니다.
- 브라우저 푸시(설정 → 토론 `pushNotifications`)의 VAPID 키 쌍(P-256)은 처음 필요할 때 한 번 만들어 설정 키 `push.vapid`에 저장합니다. 생성은 `push.vapid` 설정 행 잠금 안에서 하므로 인스턴스가 여러 개여도 한 쌍만 생깁니다. 공개 키만 API 밖으로 나가고(`notifications.push`, `GET /api/v1/admin/push-subscription`), 개인 키는 `SecretBox`로 봉인됩니다. 비밀 키를 이전 키 없이 바꾸면 개인 키를 열 수 없어 푸시 발송 잡이 실패합니다(`PushKeyUnreadable` 로그). 키 쌍을 지우면 새 쌍이 생기고 기존 브라우저 구독은 모두 403으로 무효 처리되므로 다시 구독해야 합니다. VAPID `sub`는 사이트 주소가 `https://`이면 그 origin, 아니면 첫 관리자 이메일(`mailto:`)입니다.
- 푸시 발송은 방문자가 준 엔드포인트로 나가므로 허용 목록(`PUSH_SERVICE_HOSTS`: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`; https, 포트 443, 자격 증명·프래그먼트 없음)을 등록할 때와 보낼 때 모두 확인합니다. 발송에는 DNS를 고정하는 egress 전송을 씁니다. 서비스를 지정하지 않으므로 공인 주소로만 보내며 사설 주소 규칙은 적용되지 않습니다. 리디렉션은 따르지 않으며 3xx는 영구 실패로 처리합니다. 아웃바운드 방화벽이 있으면 위 호스트의 443 포트를 열어야 합니다.
- TOTP 비밀은 봉인되어 저장되며, 검증에 성공하면 시간 단계를 원자적으로 소비하면서 현재 `SecretBox` 키로 다시 봉인합니다. 매시간 유지보수 작업은 저장된 TOTP 비밀 값을 현재 키로 다시 봉인하고 `resealed`, `unreadable`, `skipped` 개수를 기록하며, unreadable/skipped 개수가 0이 아니면 경고도 남깁니다. 키를 교체할 때는 이전 키를 없애기 전에 이 TOTP 재봉인 유지보수 작업을 실행하세요. 읽을 수 없는 행을 복구하고, 건너뛴 행을 다시 확인하고, 대기 중인 등록이 끝나거나 만료될 때까지 모든 인스턴스에 `CMS_SECRET_KEY_PREVIOUS`를 유지하세요. (Passkey 주의사항: [로그인](auth/sign-in.md#패스키와-totp))
- 선택적 재정의(루트 `.env.example`): `DATABASE_URL`, `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`, `CMS_API_URL`, `MEDIA_DIR`/`PLUGINS_DIR`(인스턴스가 여러 개면 공유 저장소), `MEDIA_MAX_MB`, `SESSION_TTL_HOURS`, `PLUGIN_TIMEOUT_MS`, `SCHEDULER_INTERVAL_MS`, `CMS_EGRESS_ALLOWLIST`, `OIDC_*`(서버에서 SSO를 고정할 때; 있으면 관리자 SSO 설정보다 우선).
- `FUNCTIONS_DIR`: 사이트 코드 저장소, 기본 `data/functions` (`apps/api` 기준). 여러 인스턴스는 같은 저장소를 사용합니다. `site.ts`가 없으면 실행할 사이트 함수가 없습니다. `FUNCTIONS_EDITOR_ENABLED`는 기본 `false`인 서버 전용 편집기 게이트이며, 같은 디렉터리의 `editor.enabled` 파일로도 허용할 수 있습니다. 관리자 설정으로 변경하지 않습니다.
