import { expect, test } from 'bun:test';
import { WebHookBus } from '#lib/server/web-hooks.js';
import { bodyClassesSchema } from '@cms/sdk';

test('web scopes stage registrations, isolate bad filters and preserve request context', async () => {
  const errors: unknown[] = [];
  const bus = new WebHookBus({
    info() {},
    warn: (...details) => {
      errors.push(details);
    },
    error: (...details) => {
      errors.push(details);
    },
  });
  const theme = bus.scope('theme:test');
  const site = bus.scope('functions:site');
  const page = { path: '/hello', kind: 'content' };
  const validate = (classes: unknown) =>
    bodyClassesSchema.parse({ page, classes }).classes;
  const observed: string[][] = [];

  theme.context.hooks.filter('page.bodyClasses', (classes) => {
    expect(theme.context.page?.path).toBe('/hello');

    return [...classes, 'theme'];
  });
  site.context.hooks.filter('page.bodyClasses', (classes) => {
    classes.push('invalid class');

    return classes;
  });
  site.context.hooks.filter('page.bodyClasses', (classes) => [
    ...classes,
    'site',
  ]);
  site.context.hooks.on('page.bodyClasses', (classes) => {
    observed.push([...classes]);
  });
  expect(await bus.apply('page.bodyClasses', ['api'], page, validate)).toEqual([
    'api',
  ]);
  theme.commit();
  site.commit();
  expect(await bus.apply('page.bodyClasses', ['api'], page, validate)).toEqual([
    'api',
    'theme',
    'site',
  ]);
  expect(observed).toEqual([['api', 'theme', 'site']]);
  expect(errors).toHaveLength(1);
  expect(theme.context.page).toBeUndefined();
  theme.dispose();
  site.dispose();
  expect(await bus.apply('page.bodyClasses', ['api'], page, validate)).toEqual([
    'api',
  ]);
});
