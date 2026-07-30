import type { ReactElement } from 'react';

/**
 * Temporary root screen — replaced by `AppLayout` and the routed feature
 * views once they land; keeps the router non-empty so `npm run dev` renders
 * something meaningful today.
 */
export function App(): ReactElement {
  return (
    <main className="app-placeholder">
      <h1>Task Management Platform</h1>
      <p>Frontend scaffold is running.</p>
    </main>
  );
}
