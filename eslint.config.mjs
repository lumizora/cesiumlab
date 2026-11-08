import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default defineConfigWithVueTs(
  {
    name: 'cesiumlab/lint-targets',
    files: ['**/*.{js,mjs,cjs,ts,mts,tsx,vue}'],
  },
  {
    name: 'cesiumlab/ignores',
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
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'cesiumlab/browser-globals',
    files: ['apps/playground/src/**/*.{ts,vue}', 'experiments/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: 'cesiumlab/node-globals',
    files: [
      '**/*.config.{js,mjs,ts}',
      'apps/playground/e2e/**/*.ts',
      'apps/playground/scripts/**/*.{js,mjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: 'cesiumlab/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  skipFormatting,
);
