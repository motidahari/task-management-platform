import { Task } from '../../../src/domain/task.model';
import { toTaskResponse } from '../../../src/task/task-response.mapper';

function fakeTask(): Task {
  return new Task({
    id: 'task-1',
    type: 'procurement',
    status: 2,
    isClosed: false,
    assignedUserId: 'user-1',
    customFields: { quote1: '100 USD' },
    createdAt: new Date('2026-07-30T12:00:00.000Z'),
    updatedAt: '2026-07-30T12:00:00.123456Z',
  });
}

describe('toTaskResponse', () => {
  describe('Given:a task domain model and its resolved status name, When:mapping to the wire shape', () => {
    it('should carry every field, with the microsecond updatedAt string passed through untouched', () => {
      const result = toTaskResponse(fakeTask(), 'supplier-offers-received');

      expect(result).toEqual({
        id: 'task-1',
        type: 'procurement',
        status: 2,
        statusName: 'supplier-offers-received',
        isClosed: false,
        assignedUserId: 'user-1',
        customFields: { quote1: '100 USD' },
        createdAt: new Date('2026-07-30T12:00:00.000Z'),
        updatedAt: '2026-07-30T12:00:00.123456Z',
      });
    });
  });
});
