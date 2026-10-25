# HTTP API 라우트

상위 문서: [AGENTS.md](../../AGENTS.md)

라우트 작성 규약은 [apps/api/AGENTS.md](../../apps/api/AGENTS.md)에 있습니다.

모든 오류 응답: `{ "error": { "code", "message", "issues?" } }`.

- `GET/PUT /api/v1/admin/users/:id/fields`: authenticated owner or `users.manage`; private/no-store. GET returns `{ fields, values }`; PUT accepts a namespaced scalar-value patch, validates active declarations, and returns the same DTO.
- `GET /api/v1/admin/captcha-providers`: `settings.manage`; registered captcha provider IDs and labels, no secrets.
- `POST /api/v1/admin/privacy/requests/:id/erase`: now returns `{ results, failed }` instead of an empty response. Core erasure remains transactional; `failed` lists extension erasers requiring follow-up.

`POST /api/v1/auth/recovery-codes` requires `settings.manage` and an interactive session issued within ten minutes; API tokens are refused. Its 401 message is `Sign in again before generating recovery codes.` Notification failures do not change a successful generation/recovery response.

`POST /api/v1/auth/factors/:factor/enroll` and SSO `/start` with `intent: link` likewise require a recent interactive session, never an API token. Refused recency checks return 401 with `Sign in again before adding credentials to your account.`

Discovery and appearance extension endpoints:

- `GET /api/v1/admin/menus/types`: `appearance.manage`; `{ key, label, source, searchable }[]`.
- `GET /api/v1/admin/menus/objects?type=&search=&page=&pageSize=`:
  `appearance.manage`; `{ items: [{ id, label }], total }`; page size 1–100,
  search at most 200 characters. Failed/disabled providers return an empty page.
- Theme editor template/part entries include `source` (`theme`, `admin`, or plugin id)
  and `readOnly`. Plugin defaults are read-only; saving creates an administrator
  customization rather than editing plugin data.

- `GET /api/v1/seo/providers`: public registered sitemap provider keys.
- `GET /api/v1/seo/sitemap?kind=&page=&pageSize=`: public provider page;
  core crawler policy is checked before provider execution, followed by
  `sitemap.entries`.
- `POST /api/v1/seo/filter`: frontend-only `{ kind, value }` presentation RPC,
  or an array of 1–7 such inputs returning results in input order.
  Requires `SSO_FRONTEND_SECRET_HEADER` and a valid
  `SSO_CLIENT_ADDRESS_HEADER`; constant-time proof check, 512 KiB streamed body
  limit, 6,000 requests/minute per proved network and 60,000 overall per process.
  Kinds: `sitemap.entries`, `feed.items`, `feed.channel`, `robots.txt`, `llms.txt`,
  `seo.markdown`, `seo.meta`. Invalid proof returns 403, exhausted budget 429,
  oversized input 413.
- `GET /api/v1/admin/patterns/contributions`: authenticated `content.create`;
  returns `{ key, source, patterns }[]` for active plugin pattern groups (`source` is the plugin id). Inserting one
  copies its editor document; it is not a persisted synced-pattern reference.

| 메서드              | 경로                                                                                | 인증            | 설명                                                                    |
| ------------------- | ----------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| GET                 | `/api/health`                                                                       |                 | 상태 확인                                                               |
| GET                 | `/api/v1/site`                                                                      |                 | 사이트 설정 (아이콘·로고는 공개 이미지로)                               |
| GET                 | `/api/v1/layout`                                                                    |                 | 사이트·SEO·테마·읽기·메뉴·위젯 묶음                                     |
| GET                 | `/api/v1/content?type&page&pageSize&search&category&tag`                            |                 | 발행 콘텐츠 요약 목록 (`content.publicSummary` 필터 적용)               |
| GET                 | `/api/v1/content/:slug`                                                             |                 | 발행 콘텐츠 1건                                                         |
| GET                 | `/api/v1/slots?path&contentId`                                                      |                 | 슬롯 HTML                                                               |
| GET                 | `/api/v1/auth/status`                                                               |                 | `{ setupRequired }`                                                     |
| GET                 | `/api/v1/install/status`                                                            |                 | `{ databaseConfigured, setupRequired }`                                 |
| POST                | `/api/v1/install/database`                                                          | 설치 키         | DB 검증·마이그레이션·접속 설정 저장                                     |
| POST                | `/api/v1/install/complete`                                                          | 설치 키         | 사이트·첫 관리자·세션을 원자적으로 생성                                 |
| GET / POST          | `/api/v1/auth/sign-in` / `/sign-in/:method`                                         |                 | Allowed methods / start a step-based sign-in                            |
| POST                | `/api/v1/auth/sign-in/setup/:method`                                                |                 | Set up sign-in using a single-use emailed token                         |
| POST                | `/api/v1/auth/sign-in/continue` · `/sign-in/factor`                                 | optional        | Continue / choose factor; account enrollment requires its owner session |
| GET / POST / DELETE | `/api/v1/auth/factors` / `/factors/:factor/enroll` / `/factors/:factor/:credential` | ✔               | List, enroll, remove own second factors                                 |
| GET / PUT           | `/api/v1/admin/sign-in`                                                             | settings.manage | Sign-in policy and registered methods/factors                           |
| POST                | `/api/v1/auth/login` · `/logout`                                                    |                 | 세션 발급/폐기                                                          |
| GET                 | `/api/v1/auth/me`                                                                   | ✔               | 현재 사용자                                                             |
| GET                 | `/api/v1/auth/sso`                                                                  |                 | Enabled providers only; sign-in policy is separate                      |
| POST                | `/api/v1/auth/sso/start`                                                            | ✔               | Begin account linking; login/claim use the sign-in engine               |
| POST                | `/api/v1/auth/sso/callback`                                                         | ✔               | Complete account linking for its initiating user                        |
| GET                 | `/api/v1/auth/sso/identity`                                                         | ✔               | 현재 사용자의 SSO 연결·운영자 할당 상태                                 |
| DELETE              | `/api/v1/auth/sso/identity/:id`                                                     | ✔               | Unlink this user's identity; SSO-only last-access guard                 |
| POST                | `/api/v1/auth/recovery`                                                             |                 | Single-use administrator recovery code; login protection                |
| GET, POST, DELETE   | `/api/v1/auth/recovery-codes`                                                       | settings.manage | Status, replace ten codes (shown once), remove                          |
| CRUD                | `/api/v1/admin/content[/:id]`                                                       | ✔               | 모든 상태의 콘텐츠                                                      |
| GET                 | `/api/v1/admin/site`                                                                | ✔               | 사이트 설정 (아이콘·로고 id와 이미지)                                   |
| PUT                 | `/api/v1/admin/site`                                                                | ✔               | 사이트 설정 저장 (`iconId`/`logoId`는 미디어 이미지)                    |
| GET                 | `/api/v1/admin/plugins`                                                             | ✔               | 플러그인 목록                                                           |
| POST                | `/api/v1/admin/plugins`                                                             | ✔               | 번들 업로드(본문 = JS 소스) 설치/업그레이드                             |
| POST                | `/api/v1/admin/plugins/:id/enable·disable`                                          | ✔               | 활성화/비활성화                                                         |
| PUT                 | `/api/v1/admin/plugins/:id/settings`                                                | ✔               | 설정 저장 (manifest 기준 검증)                                          |
| DELETE              | `/api/v1/admin/plugins/:id`                                                         | ✔               | 삭제 (번들·설정·KV 포함)                                                |
| \*                  | `/api/plugins/:id/*`                                                                | 라우트별        | 플러그인 라우트 게이트웨이                                              |

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

| Method                 | Path                                                                                           | Authentication                          | Contract                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET                    | `/api/v1/theme?preview=`                                                                       | Public                                  | Active theme, or the theme a valid preview token names                                                                        |
| POST                   | `/api/v1/admin/themes/:id/preview`                                                             | appearance.manage                       | Signed 30-minute preview token                                                                                                |
| GET                    | `/api/v1/reading · /menus/:location · /widgets`                                                | Public                                  | Reading settings (with front/posts page paths), resolved menu, both widget areas                                              |
| GET, PUT               | `/api/v1/admin/reading · /menus · /widgets`                                                    | settings / appearance                   | Reading settings, menus and locations, widget areas (`GET …/widgets/types` lists plugin widgets)                              |
| GET, PUT               | `/api/v1/admin/writing`                                                                        | content.create / settings.manage        | Writing defaults for new entries (default category, default draft status)                                                     |
| GET, POST, PUT, DELETE | `/api/v1/admin/patterns[/:id]`                                                                 | content.create (+ publish / editOthers) | Paged pattern summaries (`page`, `pageSize`, `search`); authorized single documents                                           |
| GET, POST              | `/api/v1/comments?contentId=&page=`                                                            | Public (POST rate-limited, captcha)     | Approved threads; submit (`{ status, comment, page, pendingProof, commenterProof }`)                                          |
| GET                    | `/api/v1/admin/comments · /comments/counts`                                                    | comments.moderate                       | Moderation list (`status`, `contentId`, `search`) and counts per status                                                       |
| PUT, DELETE, POST      | `/api/v1/admin/comments/:id · /:id/reply · /bulk`                                              | comments.moderate                       | Edit/delete, reply as the moderator, bulk approve/unapprove/spam/trash/delete                                                 |
| GET, PUT               | `/api/v1/admin/discussion`                                                                     | settings.manage                         | Discussion settings                                                                                                           |
| GET                    | `/api/v1/content-types · /authors/:slug`                                                       | Public                                  | Public content types and fields; public author archive                                                                        |
| *                      | `/api/v1/admin/content-types[/:key] · /fields[/:key]`                                          | content.create / fields.manage          | Content model                                                                                                                 |
| POST, GET, PUT, DELETE | `/api/v1/admin/content/:id/{trash,restore,preview,autosave,revisions[/:revisionId[/restore]]}` | Session                                 | Content workflow                                                                                                              |
| GET                    | `/api/v1/preview/:token · POST /api/v1/unlock/:id`                                             | Public                                  | Signed preview; password unlock proof                                                                                         |
| *                      | `/api/v1/admin/media[/:id] · GET /api/v1/media/files/*`                                        | media.upload / Public                   | Media library; files with Range support                                                                                       |
| GET                    | `/api/v1/admin/media?month=YYYY-MM&unattached=true · /admin/media/:id/context`                 | media.upload                            | Library filters; newer/older neighbours and the entries that show a file                                                      |
| POST                   | `/api/v1/admin/media/:id/derivative?name=`                                                     | media.upload; owner or media.manage     | Active registered size only; private, no-store WebP, not persisted. Two concurrent transforms per service; excess returns 429 |
| *                      | `/api/v1/admin/users[/:id] · /users/authors`                                                   | users.manage / content.create           | Users and author choices                                                                                                      |
| *                      | `/api/v1/auth/password{,/forgot,/reset} · /auth/tokens[/:id] · PUT /auth/me`                   | Session or public                       | Password change/reset, API tokens, own profile                                                                                |
| GET, PUT               | `/api/v1/admin/security · /email (POST /email/test) · GET /security/captcha`                   | settings.manage / Public                | Rate limits and captcha, email, public captcha config                                                                         |
| GET                    | `/api/v1/admin/capabilities`                                                                   | users.manage                            | Registered capabilities (core and plugin) for role assignment                                                                 |
| GET, PUT, POST         | `/api/v1/admin/search · /search/status · /search/test · /search/reindex`                       | settings.manage                         | Meilisearch connection, status, connection test, rebuild                                                                      |
| GET, POST              | `/api/v1/admin/plugin-pages · /:pluginId/:key · /:pluginId/:key/:action`                       | Page capability                         | Plugin admin pages (blocks) and their form actions                                                                            |
| GET                    | `/api/v1/admin/plugin-blocks`                                                                  | content.create                          | Blocks of active plugins with their attribute fields, for the editor                                                          |
| GET                    | `/api/v1/admin/plugins/:id/update`                                                             | plugins.manage                          | Latest version from the plugin's `updateUrl`                                                                                  |
| *                      | `/api/v1/admin/webhooks[/:id] · /:id/ping · /:id/rotate`                                       | tools.manage                            | Webhooks, test delivery, new secret                                                                                           |
| GET, POST              | `/api/v1/admin/export · /admin/import`                                                         | tools.manage                            | WXR export (XML download) and import (XML body)                                                                               |
| GET                    | `/api/v1/admin/health`                                                                         | tools.manage                            | Site health checks and system info                                                                                            |
| GET                    | `/api/v1/admin/themes/:id/editor`                                                              | appearance.manage                       | Site editor: templates, parts and styles with changes                                                                         |
| PUT, DELETE            | `/api/v1/admin/themes/:id/templates/:name · /parts/:slug · /styles`                            | appearance.manage                       | Save or reset a template, part or global styles                                                                               |
| GET, PUT               | `/api/v1/admin/sso`                                                                            | settings.manage                         | Single sign-on settings (client secret never returned; redirect URI shown)                                                    |
| GET                    | `/api/v1/admin/frontend-secret`                                                                | settings.manage                         | The web server's visitor-proof secret (server-to-server only, never sent to browsers)                                         |

| Method    | Path                                        | Authentication                   | Contract                                            |
| --------- | ------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| GET       | `/api/v1/privacy`                           | Public                           | Published policy link and cookie-consent preference |
| POST      | `/api/v1/privacy/confirm`                   | Signed token; rate limit/captcha | Single-use privacy confirmation                     |
| GET, PUT  | `/api/v1/admin/privacy/settings`            | settings.manage                  | Privacy policy and cookie settings                  |
| GET, POST | `/api/v1/admin/privacy/requests`            | users.manage                     | Paginated request queue / confirmation email        |
| POST      | `/api/v1/admin/privacy/requests/:id/export` | users.manage                     | Confirmed subject's streaming JSON download         |
| POST      | `/api/v1/admin/privacy/requests/:id/erase`  | users.manage                     | Confirmed transactional anonymization/redaction     |
| GET       | `/api/v1/admin/content/counts?type=`        | content.create                   | Grouped status/trash/all counts                     |
| GET       | `/api/v1/comments/feed?contentId=&limit=`   | Public                           | Approved unprotected comment feed DTOs              |
| GET       | `/api/v1/seo/sitemap?kind=author            | taxonomy`                        | Public                                              | Author and custom-taxonomy discovery |
