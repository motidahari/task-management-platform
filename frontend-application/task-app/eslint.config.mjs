import globals from 'globals';
import tseslint from 'typescript-eslint';

import rootConfig from '../../eslint.config.mjs';

export default tseslint.config(...rootConfig, {
  files: ['src/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
    globals: globals.browser,
  },
  rules: {
    // Browser code logs failures to the console — there is no stderr stream to redirect to.
    'no-console': ['error', { allow: ['error'] }],
  },
});
