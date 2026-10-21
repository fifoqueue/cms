import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Architectural boundaries (see AGENTS.md). Each file matches exactly one boundary block,
// because a later `no-restricted-imports` entry replaces earlier options instead of merging.
const plugins = {
  group: ['@cms-plugin/*', '**/plugins/*/**'],
  message: 'Core code must never reference a plugin.',
};
const api = {
  group: ['@cms/api', '@cms/api/*'],
  message: 'Only the API process may import its own code.',
};
const web = {
  group: ['@cms/web', '@cms/web/*'],
  message: 'The frontend is a separate application.',
};
const prisma = {
  group: ['@prisma/*', '**/generated/**'],
  message: 'Persistence lives in apps/api/src/infra only.',
};
const infra = {
  group: ['**/infra/**', '**/http/**'],
  message: 'Inner layers depend on ports, not on adapters.',
};
const content = {
  group: ['@cms/content', '@cms/content/*'],
  message: 'Plugins get content through PluginContext.',
};

const boundary = (files, patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/build',
      '**/dist',
      '**/.svelte-kit',
      '**/generated',
      'data',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, Bun: 'readonly' },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportNamespaceSpecifier', message: 'Use named imports.' },
        {
          selector:
            'ImportDeclaration[source.value!=/\\.(svelte|svg|png|jpe?g|webp|css)$/] > ImportDefaultSpecifier',
          message:
            'Use named imports (`import { default as x }` only where a package has no named export).',
        },
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    // Tool configuration files whose loaders require a default export.
    files: ['**/*.config.{js,ts}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Vendored shadcn-svelte primitives: callers pass already-resolved hrefs.
    files: ['apps/web/src/lib/components/ui/**'],
    rules: { 'svelte/no-navigation-without-resolve': 'off' },
  },
  boundary(['packages/**'], [plugins, api, web, prisma]),
  boundary(['apps/api/**'], [plugins, web]),
  boundary(
    ['apps/api/src/{domain,plugin-runtime,shared}/**'],
    [plugins, web, prisma, infra],
  ),
  boundary(['apps/web/**'], [plugins, api, prisma]),
  boundary(['plugins/**'], [api, web, prisma, content]),
);
