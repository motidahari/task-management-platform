import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview, ReactRenderer } from '@storybook/react-vite';

import '../src/core/i18n';
import '../src/styles/global.scss';

const preview: Preview = {
  decorators: [
    // Components read every colour from the custom properties keyed off
    // `<html data-theme>`, so the switcher writes the same attribute the app's
    // theme store writes at runtime.
    withThemeByDataAttribute<ReactRenderer>({
      themes: { dark: 'dark', light: 'light' },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
    }),
  ],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
