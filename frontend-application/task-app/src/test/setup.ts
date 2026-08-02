import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView — components that call it (e.g.
// `Select` keeping the active option visible in a scrolled listbox) would
// otherwise throw in every test that renders them, not just the ones
// exercising that behavior.
Element.prototype.scrollIntoView = (): void => {};
