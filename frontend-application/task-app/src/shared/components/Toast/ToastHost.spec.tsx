import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bus } from '../../../core/bus/bus';
import { ToastHost } from './ToastHost';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

describe('ToastHost, Given:a toast:show event carrying a messageKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve and render the translated copy', () => {
    render(<ToastHost />);

    act(() => {
      bus.emit('toast:show', { kind: 'success', messageKey: 'tasks.toast.closed' });
    });

    expect(screen.getByText('tasks.toast.closed')).toBeInTheDocument();
  });
});

describe('ToastHost, Given:a toast:show event carrying pre-resolved text', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the text as-is without translating it', () => {
    render(<ToastHost />);

    act(() => {
      bus.emit('toast:show', { kind: 'error', text: 'Something went wrong' });
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('ToastHost, Given:a toast that has been showing past the auto-dismiss delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove it on its own', () => {
    render(<ToastHost />);

    act(() => {
      bus.emit('toast:show', { kind: 'info', text: 'Heads up' });
    });
    expect(screen.getByText('Heads up')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
  });
});

describe('ToastHost, Given:the dismiss button is clicked before the auto-dismiss delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove the toast immediately', () => {
    render(<ToastHost />);

    act(() => {
      bus.emit('toast:show', { kind: 'info', text: 'Heads up' });
    });

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
  });
});
