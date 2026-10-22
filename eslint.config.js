import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Architectural boundaries (see AGENTS.md). Each file matches exactly one boundary block,
// because a later `no-restricted-imports` entry replaces earlier options instead of merging.
const plugins = {
  group: ['@cms-plugin/*', '**/plugins/*/**', '#plugin/*'],
  message: 'Core code must never reference a plugin.',
};
const api = {
  group: ['@cms/api', '@cms/api/*', '#api', '#api/*', '#test/*'],
  message: 'Only the API process may import its own code.',
};
const web = {
  group: ['@cms/web', '@cms/web/*', '#web/*', '#web-test/*', '#lib', '#lib/*'],
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
  group: ['@cms/content', '@cms/content/*', '#content/*'],
  message: 'Plugins get content through PluginContext.',
};

const relative = {
  regex: '^\\.(?:\\./|/(?!\\$types$))',
  message:
    'Use package import aliases (#api, #test, #sdk, #content, #lib, #web, #plugin), not relative module paths. Only generated ./$types is exempt.',
};

const boundary = (files, patterns) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [relative, ...patterns] }],
  },
});

const restrictedSyntax = [
  { selector: 'ImportNamespaceSpecifier', message: 'Use named imports.' },

  {
    selector:
      'ImportDeclaration[source.value!=/\\.(svelte|svg|png|jpe?g|webp|css)$/] > ImportDefaultSpecifier',
    message:
      'Use named imports (`import { default as x }` only where a package has no named export).',
  },
  { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
  {
    selector: 'ImportExpression[source.value=/^\\.{1,2}\\//]',
    message: 'Use package import aliases for dynamic imports too.',
  },
];

// Thrown and returned error messages come from the package's `Errors` catalog (AGENTS.md 4.3).
const literal = '/^(Literal|TemplateLiteral)$/';
const catalogued =
  'Use a message from the package `Errors` catalog (e.g. `Errors.ContentNotFound`), not literal text.';
const literalErrors = [
  `NewExpression[callee.name=/^(?!DomainError$|CmsApiError$).*Error$/][arguments.0.type=${literal}]`,
  `NewExpression[callee.name='DomainError'][arguments.1.type=${literal}]`,
  `NewExpression[callee.name='CmsApiError'][arguments.2.type=${literal}]`,
  `CallExpression[callee.name=/^(invalid|invalidInput|unauthorized|notFound|conflict|rateLimited)$|Error$/][arguments.0.type=${literal}]`,
  `CallExpression[callee.name=/^(error|guardUnique)$/][arguments.1.type=${literal}]`,
  `CallExpression[callee.name='errorResponse'][arguments.2.type=${literal}]`,
  `ThrowStatement[argument.type=${literal}]`,
  // Form failures and error data returned to pages carry `message` too.
  `Property[key.name='message'][value.type=${literal}]`,
].map((selector) => ({ selector, message: catalogued }));

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/build',
      '**/dist',
      '**/.svelte-kit',
      '**/.web-releases',
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
      'no-restricted-imports': ['error', { patterns: [relative] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // Omitting a field by destructuring it next to a rest element is a projection.
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    // Source code throws catalogued messages; tests and fixtures may use ad-hoc text.
    files: ['apps/*/src/**', 'packages/*/src/**'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...literalErrors],
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
