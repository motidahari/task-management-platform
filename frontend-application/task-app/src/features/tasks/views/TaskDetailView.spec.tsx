import { ErrorCode } from '@core/shared/error-codes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { bus } from '../../../core/bus/bus';
import { taskService } from '../services/taskService';
import type { TaskHistoryPage } from '../services/taskService.dto';
import { userService } from '../services/userService';
import type { UserListPage } from '../services/userService.dto';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
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
const listUsersMock = vi.spyOn(userService, 'listUsers');

const emptyHistoryPage: TaskHistoryPage = { items: [], nextCursor: null, limit: 20 };
const emptyUserPage: UserListPage = { items: [], nextCursor: null, limit: 20 };

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

// Neither name overlaps a real registered type — these exist only to prove
// action availability is derived purely from `statuses.length` and
// `finalStatus`, with no hard-coded status count anywhere in the drawer.
const twoStatusType: TaskTypeDefinition = {
  type: 'widget-review',
  displayName: 'Widget review',
  finalStatus: 2,
  statuses: [
    { status: 1, name: 'draft', displayName: 'Draft', requiredFields: [] },
    { status: 2, name: 'approved', displayName: 'Approved', requiredFields: [] },
  ],
};

const sevenStatusType: TaskTypeDefinition = {
  type: 'release-pipeline',
  displayName: 'Release pipeline',
  finalStatus: 7,
  statuses: [
    { status: 1, name: 'planning', displayName: 'Planning', requiredFields: [] },
    { status: 2, name: 'design', displayName: 'Design', requiredFields: [] },
    { status: 3, name: 'build', displayName: 'Build', requiredFields: [] },
    { status: 4, name: 'test', displayName: 'Test', requiredFields: [] },
    { status: 5, name: 'staging', displayName: 'Staging', requiredFields: [] },
    { status: 6, name: 'review', displayName: 'Review', requiredFields: [] },
    { status: 7, name: 'released', displayName: 'Released', requiredFields: [] },
  ],
};

interface StatusActionExpectation {
  readonly label: string;
  readonly typeDef: TaskTypeDefinition;
  readonly status: number;
  readonly expectAdvance: boolean;
  readonly expectReverse: boolean;
  readonly expectClose: boolean;
  readonly nextStatusDisplayName: string | null;
}

const STATUS_ACTION_MATRIX: readonly StatusActionExpectation[] = [
  {
    label: 'a 2-status type at its first status',
    typeDef: twoStatusType,
    status: 1,
    expectAdvance: true,
    expectReverse: false,
    expectClose: false,
    nextStatusDisplayName: 'Approved',
  },
  {
    label: 'a 2-status type at its final status',
    typeDef: twoStatusType,
    status: 2,
    expectAdvance: false,
    expectReverse: true,
    expectClose: true,
    nextStatusDisplayName: null,
  },
  {
    label: 'a 7-status type at its first status',
    typeDef: sevenStatusType,
    status: 1,
    expectAdvance: true,
    expectReverse: false,
    expectClose: false,
    nextStatusDisplayName: 'Design',
  },
  {
    label: 'a 7-status type at status 2 of 7 (middle)',
    typeDef: sevenStatusType,
    status: 2,
    expectAdvance: true,
    expectReverse: true,
    expectClose: false,
    nextStatusDisplayName: 'Build',
  },
  {
    label: 'a 7-status type at status 3 of 7 (middle)',
    typeDef: sevenStatusType,
    status: 3,
    expectAdvance: true,
    expectReverse: true,
    expectClose: false,
    nextStatusDisplayName: 'Test',
  },
  {
    label: 'a 7-status type at status 4 of 7 (middle)',
    typeDef: sevenStatusType,
    status: 4,
    expectAdvance: true,
    expectReverse: true,
    expectClose: false,
    nextStatusDisplayName: 'Staging',
  },
  {
    label: 'a 7-status type at status 5 of 7 (middle)',
    typeDef: sevenStatusType,
    status: 5,
    expectAdvance: true,
    expectReverse: true,
    expectClose: false,
    nextStatusDisplayName: 'Review',
  },
  {
    label: 'a 7-status type at status 6 of 7 (middle)',
    typeDef: sevenStatusType,
    status: 6,
    expectAdvance: true,
    expectReverse: true,
    expectClose: false,
    nextStatusDisplayName: 'Released',
  },
  {
    label: 'a 7-status type at its final status',
    typeDef: sevenStatusType,
    status: 7,
    expectAdvance: false,
    expectReverse: true,
    expectClose: true,
    nextStatusDisplayName: null,
  },
];

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
    useCurrentUserStore.getState().reset();
    useTaskTypeStore.setState({ status: 'ready', definitions: [developmentType], error: null });
    getTaskHistoryMock.mockResolvedValue(emptyHistoryPage);
    listUsersMock.mockResolvedValue(emptyUserPage);
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
      listUsersMock.mockResolvedValue({
        items: [
          { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
          { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
        ],
        nextCursor: null,
        limit: 20,
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));
      changeTaskStatusMock.mockResolvedValueOnce(
        buildTask({ status: 2, statusName: 'in-progress' }),
      );

      renderTaskDetailView();

      expect(await screen.findByTestId('dynamic-fields-form')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('assignee-select.label'));
      await waitFor(() => expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Branch name'), {
        target: { value: 'feature/login' },
      });
      fireEvent.click(screen.getByRole('option', { name: 'Bob' }));
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
    it('should refetch the task and rebuild the advance panel for the true state', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));
      changeTaskStatusMock.mockRejectedValueOnce({
        errorCode: ErrorCode.TASK_STATE_CONFLICT,
        status: 409,
        isNetworkError: false,
        details: { currentStatus: 2 },
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 2, statusName: 'in-progress' }));

      renderTaskDetailView();
      fireEvent.change(await screen.findByLabelText('Branch name'), {
        target: { value: 'feature/login' },
      });
      fireEvent.click(screen.getByTestId('advance-submit'));

      await waitFor(() => expect(getTaskMock).toHaveBeenCalledTimes(2));
      // The refetched task is now at `in-progress`, whose next status ('done')
      // requires no fields — the stale `branchName` input, and whatever was
      // typed into it, is gone rather than lingering on the true state.
      await waitFor(() => expect(screen.queryByLabelText('Branch name')).not.toBeInTheDocument());
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
      fireEvent.change(await screen.findByLabelText('Branch name'), { target: { value: 'x' } });
      fireEvent.click(screen.getByLabelText('assignee-select.label'));
      fireEvent.click(screen.getByRole('option', { name: 'u-1' }));
      fireEvent.click(screen.getByTestId('advance-submit'));

      await waitFor(() =>
        expect(screen.getByLabelText('Branch name')).toHaveAttribute('aria-invalid', 'true'),
      );
    });
  });

  describe('Given:the task is not yet at its final status', () => {
    it('should not offer the close action', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1 }));

      renderTaskDetailView();

      expect(await screen.findByTestId('advance-submit')).toBeInTheDocument();
      expect(screen.queryByTestId('close-button')).not.toBeInTheDocument();
    });
  });

  describe('Given:the task is at its final status and not closed', () => {
    it('should offer the close action and close the task once the confirmation is accepted', async () => {
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

  describe('Given:the user directory has loaded', () => {
    it('should resolve assignee ids to names in the history timeline, falling back to the raw id for an assignee outside the directory', async () => {
      listUsersMock.mockResolvedValue({
        items: [{ id: 'u-1', name: 'Alice', email: 'alice@demo.local' }],
        nextCursor: null,
        limit: 20,
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1, assignedUserId: 'u-1' }));
      getTaskHistoryMock.mockResolvedValueOnce({
        items: [
          {
            fromStatus: null,
            toStatus: 1,
            assignedUserId: 'u-1',
            fieldsSnapshot: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: 'u-unknown',
            fieldsSnapshot: {},
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        nextCursor: null,
        limit: 20,
      });

      renderTaskDetailView();

      expect(
        await screen.findByText('history-timeline.assignee-label:{"name":"Alice"}'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('history-timeline.assignee-label:{"name":"u-unknown"}'),
      ).toBeInTheDocument();
    });

    it('should offer the full user directory in the reassignment picker, not just the ids this task has touched', async () => {
      listUsersMock.mockResolvedValue({
        items: [
          { id: 'u-1', name: 'Alice', email: 'alice@demo.local' },
          { id: 'u-2', name: 'Bob', email: 'bob@demo.local' },
          { id: 'u-3', name: 'Carol', email: 'carol@demo.local' },
        ],
        nextCursor: null,
        limit: 20,
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1, assignedUserId: 'u-1' }));

      renderTaskDetailView();
      await screen.findByTestId('status-stepper');

      fireEvent.click(screen.getByLabelText('assignee-select.label'));
      expect(await screen.findByRole('option', { name: 'Alice' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();
    });

    it('should still offer the task’s current assignee in the picker when that id has fallen out of the directory', async () => {
      listUsersMock.mockResolvedValue({
        items: [{ id: 'u-2', name: 'Bob', email: 'bob@demo.local' }],
        nextCursor: null,
        limit: 20,
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1, assignedUserId: 'u-unknown' }));

      renderTaskDetailView();
      await screen.findByTestId('status-stepper');

      fireEvent.click(screen.getByLabelText('assignee-select.label'));
      expect(await screen.findByRole('option', { name: 'Bob' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'u-unknown' })).toBeInTheDocument();
    });
  });

  describe('Given:the user directory has not loaded yet', () => {
    it('should still offer the task’s current assignee in the picker, pre-selected, with no crash', async () => {
      getTaskMock.mockResolvedValueOnce(buildTask({ status: 1, assignedUserId: 'u-1' }));

      renderTaskDetailView();
      await screen.findByTestId('status-stepper');

      fireEvent.click(screen.getByLabelText('assignee-select.label'));
      expect(await screen.findByRole('option', { name: 'u-1' })).toBeInTheDocument();
    });
  });

  describe('Given:a type whose action rules are derived purely from its statuses, at any status count', () => {
    it.each(STATUS_ACTION_MATRIX)(
      'should render exactly the actions valid for $label, with no status-count assumption baked in',
      async ({
        typeDef,
        status,
        expectAdvance,
        expectReverse,
        expectClose,
        nextStatusDisplayName,
      }) => {
        useTaskTypeStore.setState({ status: 'ready', definitions: [typeDef], error: null });
        getTaskMock.mockResolvedValueOnce(buildTask({ type: typeDef.type, status }));

        renderTaskDetailView();

        await screen.findByTestId('status-stepper');

        if (expectAdvance) {
          expect(screen.getByTestId('advance-submit')).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId('advance-submit')).not.toBeInTheDocument();
        }

        if (expectReverse) {
          expect(screen.getByTestId('reverse-submit')).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId('reverse-submit')).not.toBeInTheDocument();
        }

        if (expectClose) {
          expect(screen.getByTestId('close-button')).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId('close-button')).not.toBeInTheDocument();
        }

        if (nextStatusDisplayName) {
          expect(
            screen.getByText(
              `task-detail-view.next-status-heading:${JSON.stringify({ status: nextStatusDisplayName })}`,
            ),
          ).toBeInTheDocument();
        } else {
          expect(screen.getByText('task-detail-view.final-status-title')).toBeInTheDocument();
        }
      },
    );
  });

  describe('Given:the loaded task’s type has no entry in the loaded task-type metadata', () => {
    it('should render an explicit error naming the type, and retry by reloading the task-type metadata (not just the task)', async () => {
      const loadTaskTypesMock = vi
        .spyOn(useTaskTypeStore.getState(), 'loadTaskTypes')
        .mockResolvedValue(undefined);
      getTaskMock.mockResolvedValueOnce(buildTask({ type: 'ghost-type', status: 1 }));

      renderTaskDetailView();

      expect(
        await screen.findByText('task-detail-view.type-unresolved-title:{"type":"ghost-type"}'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('status-stepper')).not.toBeInTheDocument();
      expect(screen.queryByTestId('advance-submit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reverse-submit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('close-button')).not.toBeInTheDocument();

      getTaskMock.mockResolvedValueOnce(buildTask({ type: 'ghost-type', status: 1 }));
      fireEvent.click(screen.getByTestId('task-detail-view-type-error-retry'));

      expect(loadTaskTypesMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(getTaskMock).toHaveBeenCalledTimes(2));
    });
  });

  describe('Given:the loaded task’s type resolves with an empty statuses array', () => {
    it('should render the same explicit error state as an unknown type', async () => {
      useTaskTypeStore.setState({
        status: 'ready',
        definitions: [
          { type: 'empty-type', displayName: 'Empty type', finalStatus: 0, statuses: [] },
        ],
        error: null,
      });
      getTaskMock.mockResolvedValueOnce(buildTask({ type: 'empty-type', status: 1 }));

      renderTaskDetailView();

      expect(
        await screen.findByText('task-detail-view.type-unresolved-title:{"type":"empty-type"}'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('status-stepper')).not.toBeInTheDocument();
      expect(screen.queryByTestId('task-detail-view-actions')).not.toBeInTheDocument();
    });
  });
});
