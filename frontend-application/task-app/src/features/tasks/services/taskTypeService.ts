import { BaseHttpService } from '../../../core/services/BaseHttpService';
import type { TaskTypeDefinition } from '../types';

/**
 * Every registered task-type definition — creation dropdown options, status
 * chains, and per-status required fields all derive from this single
 * response, so a new type appears fully functional in the UI with zero
 * changes here.
 */
export class TaskTypeService extends BaseHttpService {
  constructor() {
    super();
  }

  getTaskTypes(): Promise<TaskTypeDefinition[]> {
    return this.get<TaskTypeDefinition[]>('/task-types');
  }
}

export const taskTypeService = new TaskTypeService();
