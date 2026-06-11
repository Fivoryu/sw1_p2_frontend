import { WorkflowTask } from '../../core/models/workflow.models';

export function taskPriorityScore(task: Pick<WorkflowTask, 'priorityScore' | 'priority'>): number {
  if (typeof task.priorityScore === 'number') {
    return task.priorityScore;
  }
  if (task.priority === 'alta') {
    return 70;
  }
  if (task.priority === 'baja') {
    return 20;
  }
  return 45;
}

export function sortTasksByAiPriority<T extends Pick<WorkflowTask, 'priorityScore' | 'priority'>>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => taskPriorityScore(right) - taskPriorityScore(left));
}
