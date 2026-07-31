import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { configError } from './core/config/app.config';
import { ConfigError } from './core/config/ConfigError';
import { router } from './core/router';
import './core/i18n';
import './styles/global.scss';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element (#root) is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    {configError ? <ConfigError message={configError} /> : <RouterProvider router={router} />}
  </StrictMode>,
);
