import { ErrorCode } from '@core/shared/error-codes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { bus } from '../../../core/bus/bus';
import { taskService } from '../services/taskService';
import type { TaskHistoryPage } from '../services/taskService.dto';
import { useTaskStore } from '../stores/useTaskStore';
import { useTaskTypeStore } from '../stores/useTaskTypeStore';
import type { Task, TaskTypeDefinition } from '../types';
import { TaskDetailView } from './TaskDetailView';

// `initReactI18next` must stay real — `core/i18n` (pulled in transitively via
// the stores) registers it at import time, and a fully-replaced module has no
// such export to register.
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
    }),
  };
});

vi.mock('../../../core/services/RealtimeService', () => ({
  realtimeService: {
    joinTask: vi.fn(),
    leaveTask: vi.fn(),
    joinUser: vi.fn(),
    leaveUser: vi.fn(),
    on: vi.fn(() => vi.fn()),
  },
}));

const getTaskMock = vi.spyOn(taskService, 'getTask');
const changeTaskStatusMock = vi.spyOn(taskService, 'changeTaskStatus');
const closeTaskMock = vi.spyOn(taskService, 'closeTask');
const getTaskHistoryMock = vi.spyOn(taskService, 'getTaskHistory');

const emptyHistoryPage: TaskHistoryPage = { items: [], nextCursor: null, limit: 20 };

const developmentType: TaskTypeDefinition = {
  type: 'development',
  displayName: 'Development',
  finalStatus: 3,
  statuses: [
    { status: 1, name: 'open', displayName: 'Open', requiredFields: [] },
    {
      status: 2,
      name: 'in-progress',
      displayName: 'In progress',
      requiredFields: [
        { key: 'branchName', label: 'Branch name', fieldType: 'string', maxLength: 50 },
      ],
    },
    { status: 3, name: 'done', displayName: 'Done', requiredFields: [] },
  ],
};

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    type: 'development',
    status: 1,
    statusName: 'open',
    isClosed: false,
    assignedUserId: 'u-1',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderTaskDetailView(taskId = 't-1'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/tasks/${taskId}`]}>
      <Routes>
        <Route path="/tasks/:taskId" element={<TaskDetailView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TaskDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.getState().reset();
    useTaskTypeStore.setState({ status: 'ready', definitions: [developmentType], error: null });
    getTaskHistoryMock.mockResolvedValue(emptyHistoryPage);
  });

  describe('Given:a task loads successfully', () => {
    it('should render the status stepper and the task’s read-only fields', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ customFields: { title: 'Fix the bug' } }));

      renderTaskDetailView();

      expect(await screen.findByTestId('status-stepper')).toBeInTheDocument();
      expect(screen.getByText('title')).toBeInTheDocument();
      expect(screen.getByText('Fix the bug')).toBeInTheDocument();
    });
  });

  describe('Given:the user opens the advance form and submits it', () => {
    it('should render the next status’s required fields and the assignee picker, then submit with expectedStatus', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));
      getTaskHistoryMock.mockResolvedValueOnce({
        items: [
          {
            fromStatus: null,
            toStatus: 1,
            assignedUserId: 'u-2',
            fieldsSnapshot: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        nextCursor: null,
        limit: 20,
      });
      changeTaskStatusMock.mockResolvedValueOnce(
        buildTask({ status: 2, statusName: 'in-progress' }),
      );

      renderTaskDetailView();
      fireEvent.click(await screen.findByTestId('advance-button'));

      expect(screen.getByTestId('dynamic-fields-form')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('option', { name: 'u-2' })).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Branch name'), {
        target: { value: 'feature/login' },
      });
      fireEvent.change(screen.getByLabelText('assignee-select.label'), {
        target: { value: 'u-2' },
      });
      fireEvent.click(screen.getByTestId('advance-submit'));

      await waitFor(() =>
        expect(changeTaskStatusMock).toHaveBeenCalledWith('t-1', {
          direction: 'forward',
          expectedStatus: 1,
          nextAssignedUserId: 'u-2',
          customFields: { branchName: 'feature/login' },
        }),
      );
    });
  });

  describe('Given:advancing fails with a stale expectedStatus (TASK_STATE_CONFLICT)', () => {
    it('should refetch the task and close the advance form on the true state', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));
      changeTaskStatusMock.mockRejectedValueOnce({
        errorCode: ErrorCode.TASK_STATE_CONFLICT,
        status: 409,
        isNetworkError: false,
        details: { currentStatus: 2 },
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 2, statusName: 'in-progress' }));

      renderTaskDetailView();
      fireEvent.click(await screen.findByTestId('advance-button'));
      fireEvent.change(screen.getByLabelText('Branch name'), {
        target: { value: 'feature/login' },
      });
      fireEvent.click(screen.getByTestId('advance-submit'));

      await waitFor(() => expect(getTaskMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByTestId('advance-form')).not.toBeInTheDocument());
    });
  });

  describe('Given:advancing fails with details.missing naming a required field', () => {
    it('should highlight that field', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));
      changeTaskStatusMock.mockRejectedValueOnce({
        errorCode: ErrorCode.MISSING_REQUIRED_FIELDS,
        status: 422,
        isNetworkError: false,
        details: { missing: ['branchName'] },
      });

      renderTaskDetailView();
      fireEvent.click(await screen.findByTestId('advance-button'));
      fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'x' } });
      fireEvent.change(screen.getByLabelText('assignee-select.label'), {
        target: { value: 'u-1' },
      });
      fireEvent.click(screen.getByTestId('advance-submit'));

      await waitFor(() =>
        expect(screen.getByLabelText('Branch name')).toHaveAttribute('aria-invalid', 'true'),
      );
    });
  });

  describe('Given:the task is not yet at its final status', () => {
    it('should disable the close button', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));

      renderTaskDetailView();

      expect(await screen.findByTestId('close-button')).toBeDisabled();
    });
  });

  describe('Given:the task is at its final status and not closed', () => {
    it('should enable the close button and close the task once the confirmation is accepted', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 3, statusName: 'done' }));
      closeTaskMock.mockResolvedValueOnce(
        buildTask({ status: 3, statusName: 'done', isClosed: true }),
      );
      const modalHandler = vi.fn();
      const unsubscribe = bus.on('modal:open', modalHandler);

      renderTaskDetailView();
      const closeButton = await screen.findByTestId('close-button');
      expect(closeButton).toBeEnabled();

      fireEvent.click(closeButton);

      expect(modalHandler).toHaveBeenCalledTimes(1);
      const [event] = modalHandler.mock.calls[0] as [{ props: { onConfirm: () => void } }];
      event.props.onConfirm();
      unsubscribe();

      await waitFor(() => expect(closeTaskMock).toHaveBeenCalledWith('t-1'));
    });
  });

  describe('Given:the task is closed', () => {
    it('should hide the action controls but keep the history timeline visible', async () => {
      getTaskMock.mockResolvedValueOnce(
        buildTask({ status: 3, statusName: 'done', isClosed: true }),
      );
      getTaskHistoryMock.mockResolvedValueOnce({
        items: [
          {
            fromStatus: 2,
            toStatus: null,
            assignedUserId: 'u-1',
            fieldsSnapshot: {},
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        ],
        nextCursor: null,
        limit: 20,
      });

      renderTaskDetailView();

      expect(await screen.findByTestId('history-timeline')).toBeInTheDocument();
      expect(screen.queryByTestId('task-detail-view-actions')).not.toBeInTheDocument();
    });
  });
});
