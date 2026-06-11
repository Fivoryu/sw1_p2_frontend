import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkflowTask } from '../../core/models/workflow.models';
import { WorkflowService } from '../../core/services/workflow.service';
import { sortTasksByAiPriority } from '../../shared/utils/task-priority.utils';

type InboxQueue = 'mine' | 'pool' | 'all';

@Component({
  selector: 'app-workflow-inbox-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-inbox-page.component.html',
  styleUrl: './workflow-inbox-page.component.scss',
})
export class WorkflowInboxPageComponent {
  private readonly router = inject(Router);
  readonly workflowService = inject(WorkflowService);

  readonly queueFilter = signal<InboxQueue>('mine');
  readonly statusFilter = signal<'all' | WorkflowTask['status']>('all');
  readonly priorityFilter = signal<'all' | WorkflowTask['priority']>('all');
  readonly searchTerm = signal('');
  readonly tasks = this.workflowService.inboxTasks;

  readonly myTasks = computed(() =>
    this.tasks().filter((task) => task.assignedUserId === this.workflowService.currentUserId()),
  );

  readonly poolTasks = computed(() => this.tasks().filter((task) => !task.assignedUserId));

  readonly queueCounts = computed(() => ({
    mine: this.myTasks().length,
    pool: this.poolTasks().length,
    all: this.tasks().length,
  }));

  readonly filteredTasks = computed<WorkflowTask[]>(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const queue = this.queueFilter();
    const filtered = this.tasks().filter((task) => {
      const matchesQueue =
        queue === 'all' ||
        (queue === 'mine' && task.assignedUserId === this.workflowService.currentUserId()) ||
        (queue === 'pool' && !task.assignedUserId);
      const matchesStatus = this.statusFilter() === 'all' || task.status === this.statusFilter();
      const matchesPriority = this.priorityFilter() === 'all' || task.priority === this.priorityFilter();
      const matchesSearch =
        !search ||
        [task.processCode, task.taskName, task.policyName, task.requesterName, task.departmentName]
          .join(' ')
          .toLowerCase()
          .includes(search);
      return matchesQueue && matchesStatus && matchesPriority && matchesSearch;
    });
    return sortTasksByAiPriority(filtered);
  });

  readonly departmentName = this.workflowService.currentDepartmentName;

  setQueue(queue: InboxQueue): void {
    this.queueFilter.set(queue);
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value as 'all' | WorkflowTask['status']);
  }

  onPriorityChange(value: string): void {
    this.priorityFilter.set(value as 'all' | WorkflowTask['priority']);
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  openTask(taskId: string): void {
    this.router.navigate(['/workflow/bandeja', taskId]);
  }

  priorityClass(priority: WorkflowTask['priority']): string {
    return `priority priority--${priority}`;
  }

  aiPriorityClass(task: WorkflowTask): string {
    return `ai-priority ai-priority--${task.aiPriorityLevel ?? 'media'}`;
  }

  aiPriorityLabel(task: WorkflowTask): string {
    if (task.priorityScore == null) {
      return 'Sin score';
    }
    return `${task.priorityScore}/100 · ${(task.aiPriorityLevel ?? 'media').toUpperCase()}`;
  }

  statusLabel(status: WorkflowTask['status']): string {
    return {
      nueva: 'Nueva',
      en_progreso: 'En progreso',
      pendiente: 'Pendiente',
      reclamada: 'Reclamada',
    }[status];
  }

  statusClass(status: WorkflowTask['status']): string {
    return `status status--${status}`;
  }

  assignmentClass(task: WorkflowTask): string {
    if (!task.assignedUserId) {
      return 'assignment assignment--pool';
    }
    if (task.assignedUserId === this.workflowService.currentUserId()) {
      return 'assignment assignment--mine';
    }
    return 'assignment assignment--other';
  }

  assignmentLabel(task: WorkflowTask): string {
    if (!task.assignedUserId) {
      return 'Sin asignar';
    }
    if (task.assignedUserId === this.workflowService.currentUserId()) {
      return 'Tú';
    }
    return task.assignedUserName ?? 'Otro usuario';
  }

  actionLabel(task: WorkflowTask): string {
    if (!task.assignedUserId) {
      return 'Reclamar';
    }
    if (task.assignedUserId === this.workflowService.currentUserId()) {
      return 'Trabajar';
    }
    return 'Ver';
  }

  emptyQueueMessage(): string {
    if (this.queueFilter() === 'mine') {
      return 'No tienes tareas asignadas en este momento.';
    }
    if (this.queueFilter() === 'pool') {
      return 'No hay tareas disponibles para reclamar en tu departamento.';
    }
    return 'No hay tareas que coincidan con los filtros aplicados.';
  }
}
