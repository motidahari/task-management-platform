import { useState, type FormEvent, type ReactElement } from 'react';

import { useBus } from '../../../../core/bus/useBus';
import { Avatar } from '../../../../shared/components/Avatar';
import { Button } from '../../../../shared/components/Button';
import { Select, type SelectOption } from '../../../../shared/components/Select';
import { useToast } from '../../../../shared/hooks/useToast';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import { useCurrentUserStore } from '../../stores/useCurrentUserStore';
import { useTaskStore } from '../../stores/useTaskStore';
import { useTaskTypeStore } from '../../stores/useTaskTypeStore';
import type { TaskTypeDefinition, User } from '../../types';
import './CreateTaskForm.scss';

function toTypeOptions(definitions: readonly TaskTypeDefinition[]): SelectOption[] {
  return definitions.map((definition) => ({
    value: definition.type,
    label: definition.displayName,
  }));
}

function toAssigneeOptions(users: readonly User[]): SelectOption[] {
  return users.map((user) => ({
    value: user.id,
    label: user.name,
    icon: <Avatar seed={user.id} size={20} />,
  }));
}

/**
 * The `create-task` modal's body: task type (from the session-cached type
 * metadata) plus initial assignee, submitted straight to
 * `useTaskStore.createTask`. Clears itself and closes the modal only on
 * success — a failed submit keeps the user's picks and the modal open so
 * they don't have to redo the whole form after fixing one field. Renders no
 * title of its own — `CreateTaskModal` supplies that via the shared `Modal`.
 */
export function CreateTaskForm(): ReactElement {
  const { t } = useTranslation('create-task-form');
  const toast = useToast();
  const { emit } = useBus();
  const definitions = useTaskTypeStore((state) => state.definitions);
  const users = useCurrentUserStore((state) => state.users);
  const isSubmitting = useTaskStore((state) => state.isLoading);
  const createTask = useTaskStore((state) => state.createTask);

  const [type, setType] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');

  const isFormValid = type !== '' && assignedUserId !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isFormValid) return;

    const created = await createTask({ type, assignedUserId });
    if (created) {
      setType('');
      setAssignedUserId('');
      toast.success('create-task-form.success-toast');
      emit('modal:close');
    }
  }

  return (
    <form
      className="create-task-form"
      data-testid="create-task-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Select
        id="create-task-form-type"
        label={t('type-label')}
        value={type}
        options={toTypeOptions(definitions)}
        onChange={setType}
        placeholder={t('type-placeholder')}
        required
        disabled={isSubmitting}
      />
      <Select
        id="create-task-form-assignee"
        label={t('assignee-label')}
        value={assignedUserId}
        options={toAssigneeOptions(users)}
        onChange={setAssignedUserId}
        placeholder={t('assignee-placeholder')}
        required
        disabled={isSubmitting}
      />
      <Button
        type="submit"
        loading={isSubmitting}
        disabled={!isFormValid}
        testId="create-task-form-submit"
      >
        {t('submit-button')}
      </Button>
    </form>
  );
}
