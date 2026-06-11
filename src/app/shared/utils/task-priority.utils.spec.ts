import { sortTasksByAiPriority, taskPriorityScore } from './task-priority.utils';

describe('task-priority utils', () => {
  it('uses backend AI score when available', () => {
    expect(taskPriorityScore({ priorityScore: 82, priority: 'media' })).toBe(82);
  });

  it('falls back to textual priority', () => {
    expect(taskPriorityScore({ priorityScore: null, priority: 'alta' })).toBeGreaterThan(
      taskPriorityScore({ priorityScore: null, priority: 'baja' }),
    );
  });

  it('sorts tasks by AI priority descending', () => {
    const sorted = sortTasksByAiPriority([
      { id: 'baja', priorityScore: 15, priority: 'baja' },
      { id: 'alta', priorityScore: 91, priority: 'media' },
      { id: 'media', priorityScore: 45, priority: 'alta' },
    ]);

    expect(sorted.map((task) => task.id)).toEqual(['alta', 'media', 'baja']);
  });
});
