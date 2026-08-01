import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Only the shared design-system components are catalogued — feature
 * components are wired to stores and the router, so they document their
 * behaviour through their specs rather than through isolated stories.
 */
const config: StorybookConfig = {
  stories: ['../src/shared/components/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
