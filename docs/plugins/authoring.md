# 플러그인 작성

상위 문서: [AGENTS.md](../../AGENTS.md)

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

- 번들은 `plugin` 이라는 **이름 있는 내보내기** 를 가진 단일 ES 모듈입니다: `bun build src/index.ts --target=bun --format=esm --outfile=dist/<id>.js`.
- 모듈 최상위에서 부수효과 금지. 모든 등록은 `activate` 안에서 합니다.
- HTML을 반환할 때 사용자 입력·설정 값은 **반드시 이스케이프** 하세요. 테마의 CSS 클래스(Tailwind 등)에 의존하지 말고 자체 클래스/인라인 스타일을 쓰세요.
- 예제: `plugins/reading-time` (필터 + 슬롯 + 설정).
