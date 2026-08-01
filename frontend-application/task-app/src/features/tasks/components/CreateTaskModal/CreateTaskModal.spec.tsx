import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { CreateTaskModal } from './CreateTaskModal';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../CreateTaskForm', () => ({
  CreateTaskForm: () => <div data-testid="create-task-form-stub" />,
}));

describe('CreateTaskModal', () => {
  let onClose: Mock<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
  });

  describe('Given:it is rendered as the active modal', () => {
    it('should render the create-task-form scope title as the dialog name and the form inside it', () => {
      render(<CreateTaskModal onClose={onClose} />);

      expect(screen.getByRole('dialog', { name: 'create-task-form.title' })).toBeInTheDocument();
      expect(screen.getByTestId('create-task-form-stub')).toBeInTheDocument();
    });
  });

  describe('Given:the dialog close control is clicked', () => {
    it('should call onClose', () => {
      render(<CreateTaskModal onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'modal.close-button-label' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
