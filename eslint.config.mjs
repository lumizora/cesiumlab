import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-*/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/playground/public/cesium/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/playground/src/**/*.{ts,tsx}', 'experiments/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      '**/*.config.{js,mjs,ts}',
      'apps/playground/e2e/**/*.ts',
      'apps/playground/scripts/**/*.{js,mjs}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
