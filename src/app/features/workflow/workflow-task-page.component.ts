import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ReassignmentSuggestionApi, RouteRecommendationApi } from '../../core/models/ai.models';
import { AiService } from '../../core/services/ai.service';
import { AuthService } from '../../core/services/auth.service';
import { fieldTypeInputType, humanizeFieldName } from '../../core/models/policy-form-field.config';
import { WorkflowTask, WorkflowTaskFormField } from '../../core/models/workflow.models';
import { WorkflowService } from '../../core/services/workflow.service';

@Component({
  selector: 'app-workflow-task-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './workflow-task-page.component.html',
  styleUrl: './workflow-task-page.component.scss',
})
export class WorkflowTaskPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly aiService = inject(AiService);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  readonly authService = inject(AuthService);
  readonly workflowService = inject(WorkflowService);
  readonly aiDraft = signal('');
  readonly aiLoading = signal(false);
  readonly aiRecording = signal(false);
  readonly aiAudioLoading = signal(false);
  readonly aiTranscribedText = signal('');
  readonly routeRecommendation = signal<RouteRecommendationApi | null>(null);
  readonly routeRecommendationLoading = signal(false);
  readonly selectedRecommendedUserId = signal<string | null>(null);
  readonly reassignmentSuggestions = signal<ReassignmentSuggestionApi[]>([]);
  readonly reassignmentLoading = signal(false);
  readonly reassignmentExecuting = signal<string | null>(null);

  readonly taskId = toSignal(this.route.paramMap.pipe(map((params) => params.get('taskId') ?? '')), {
    initialValue: '',
  });

  readonly selectedTaskForm = this.workflowService.selectedTaskForm;
  readonly selectedTaskResponses = this.workflowService.selectedTaskResponses;

  readonly task = computed(() => {
    const taskId = this.taskId();
    if (!taskId) {
      return null;
    }
    return this.workflowService.findInboxTask(taskId);
  });

  readonly isOwnTask = computed(() => {
    const task = this.task();
    const userId = this.workflowService.currentUserId();
    return !!task?.assignedUserId && !!userId && task.assignedUserId === userId;
  });

  readonly canClaim = computed(() => {
    const task = this.task();
    return !!task && !task.assignedUserId && (task.status === 'pendiente' || task.status === 'nueva');
  });

  readonly canComplete = computed(() => {
    const task = this.task();
    if (!task || !this.isOwnTask()) {
      return false;
    }
    return task.status === 'reclamada' || task.status === 'en_progreso' || task.status === 'pendiente' || task.status === 'nueva';
  });

  readonly isAssignedToOther = computed(() => {
    const task = this.task();
    return !!task?.assignedUserId && !this.isOwnTask();
  });

  constructor() {
    effect(() => {
      const taskId = this.taskId();
      if (!taskId) {
        this.workflowService.clearSelectedTaskDetail();
        return;
      }

      this.authService.loadCurrentUser().subscribe();
    });

    effect(() => {
      const taskId = this.taskId();
      const canComplete = this.canComplete();
      const formId = this.task()?.formId ?? null;

      if (!taskId || !formId) {
        if (!taskId) {
          this.workflowService.clearSelectedTaskDetail();
        }
        return;
      }

      if (canComplete) {
        this.workflowService.loadTaskDetail(taskId);
        return;
      }

      this.workflowService.clearSelectedTaskDetail();
    });
  }

  badgeClass(priority: WorkflowTask['priority']): string {
    return `priority priority--${priority}`;
  }

  statusLabel(status: WorkflowTask['status']): string {
    return {
      nueva: 'Nueva',
      en_progreso: 'En progreso',
      pendiente: 'Pendiente',
      reclamada: 'Reclamada',
    }[status];
  }

  statusBadgeClass(status: WorkflowTask['status']): string {
    return `status-badge status-badge--${status}`;
  }

  claimTask(): void {
    const task = this.task();
    if (!task || !this.canClaim()) {
      return;
    }

    this.workflowService.claimTask(task.id, () => {
      if (task.formId) {
        this.workflowService.loadTaskDetail(task.id, true);
      }
    });
  }

  completeTask(): void {
    const task = this.task();
    if (!task || !this.canComplete()) {
      return;
    }

    this.workflowService.completeTask(task.id, (result) => {
      if (!result.next_task || result.next_task.department_id !== this.workflowService.currentDepartmentId()) {
        this.router.navigate(['/workflow/tramites']);
        return;
      }

      this.router.navigate(['/workflow/bandeja', result.next_task.id]);
    }, this.selectedRecommendedUserId());
  }

  suggestRoute(): void {
    const task = this.task();
    if (!task) {
      return;
    }
    this.routeRecommendationLoading.set(true);
    this.aiService.recommendRoute(task.instanceId, task.id).subscribe({
      next: (result) => {
        this.routeRecommendation.set(result);
        this.selectedRecommendedUserId.set(result.recommended_user_id);
        this.routeRecommendationLoading.set(false);
      },
      error: () => this.routeRecommendationLoading.set(false),
    });
  }

  selectRecommendedUser(userId: string): void {
    this.selectedRecommendedUserId.set(userId);
  }

  suggestReassignments(): void {
    const task = this.task();
    if (!task) {
      return;
    }
    this.reassignmentLoading.set(true);
    this.aiService.suggestReassignments(task.instanceId).subscribe({
      next: (result) => {
        this.reassignmentSuggestions.set(result.suggestions);
        this.reassignmentLoading.set(false);
      },
      error: () => {
        this.reassignmentSuggestions.set([]);
        this.reassignmentLoading.set(false);
      },
    });
  }

  executeReassignment(suggestion: ReassignmentSuggestionApi): void {
    this.reassignmentExecuting.set(suggestion.task_id);
    this.aiService.executeReassignment(suggestion.task_id, suggestion.target_user_id).subscribe({
      next: () => {
        this.reassignmentSuggestions.update((s) => s.filter((item) => item.task_id !== suggestion.task_id));
        this.reassignmentExecuting.set(null);
      },
      error: () => this.reassignmentExecuting.set(null),
    });
  }

  updateFieldValue(fieldName: string, value: unknown): void {
    this.workflowService.updateSelectedTaskResponse(fieldName, value);
  }

  inputType(type: string): string {
    return fieldTypeInputType(type as never);
  }

  fieldValue(fieldName: string): unknown {
    return this.selectedTaskResponses()[fieldName];
  }

  fieldStringValue(fieldName: string): string {
    const value = this.fieldValue(fieldName);
    return value == null ? '' : String(value);
  }

  fieldDisplayLabel(field: WorkflowTaskFormField): string {
    return field.label?.trim() || humanizeFieldName(field.name);
  }

  fieldSelectOptions(field: WorkflowTaskFormField): string[] {
    return Array.isArray(field.options) ? field.options.filter((option) => !!option?.trim()) : [];
  }

  trackField(_index: number, field: WorkflowTaskFormField): string {
    return field.id || field.name;
  }

  trackOption(_index: number, option: string): string {
    return option;
  }

  suggestWithAi(): void {
    const task = this.task();
    if (!task || !this.aiDraft().trim()) {
      return;
    }
    this.aiLoading.set(true);
    this.aiService.suggestFormValues(task.id, this.aiDraft()).subscribe({
      next: (result) => {
        Object.entries(result.suggestions).forEach(([fieldName, value]) => this.workflowService.updateSelectedTaskResponse(fieldName, value));
        this.aiLoading.set(false);
      },
      error: () => {
        this.aiLoading.set(false);
      },
    });
  }

  async toggleAiRecording(): Promise<void> {
    if (this.aiRecording()) {
      this.mediaRecorder?.stop();
      return;
    }
    const task = this.task();
    if (!task) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.sendAiAudio(task.id, new Blob(this.audioChunks, { type: 'audio/webm' }));
      };
      this.aiTranscribedText.set('');
      this.mediaRecorder.start();
      this.aiRecording.set(true);
    } catch {
      this.aiAudioLoading.set(false);
    }
  }

  private sendAiAudio(taskId: string, blob: Blob): void {
    this.aiRecording.set(false);
    this.aiAudioLoading.set(true);
    this.aiService.suggestFormValuesFromAudio(taskId, blob).subscribe({
      next: (result) => {
        Object.entries(result.suggestions).forEach(([fieldName, value]) => this.workflowService.updateSelectedTaskResponse(fieldName, value));
        this.aiDraft.set(result.transcribed_text || '');
        this.aiTranscribedText.set(result.transcribed_text || '');
        this.aiAudioLoading.set(false);
      },
      error: () => {
        this.aiAudioLoading.set(false);
      },
    });
  }
}
