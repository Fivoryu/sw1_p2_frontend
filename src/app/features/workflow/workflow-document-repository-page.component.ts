import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DocumentRepositoryPanelComponent } from '../../shared/components/documents/document-repository-panel.component';
import { WorkflowDocument } from '../../core/models/workflow.models';
import { WorkflowService } from '../../core/services/workflow.service';

@Component({
  selector: 'app-workflow-document-repository-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DocumentRepositoryPanelComponent],
  templateUrl: './workflow-document-repository-page.component.html',
  styleUrl: './workflow-document-repository-page.component.scss',
})
export class WorkflowDocumentRepositoryPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly workflowService = inject(WorkflowService);

  readonly mode = toSignal(this.route.data.pipe(map((data) => (data['mode'] as 'task' | 'instance') ?? 'task')), {
    initialValue: 'task' as const,
  });

  readonly taskId = toSignal(this.route.paramMap.pipe(map((params) => params.get('taskId') ?? '')), {
    initialValue: '',
  });

  readonly routeInstanceId = toSignal(this.route.paramMap.pipe(map((params) => params.get('instanceId') ?? '')), {
    initialValue: '',
  });

  readonly selectedTaskDocuments = this.workflowService.selectedTaskDocuments;
  readonly selectedInstanceDocuments = this.workflowService.selectedInstanceDocuments;
  readonly documentVersions = this.workflowService.selectedDocumentVersions;
  readonly documentComments = this.workflowService.selectedDocumentComments;

  readonly task = computed(() => {
    const taskId = this.taskId();
    if (!taskId) {
      return null;
    }
    return this.workflowService.findInboxTask(taskId);
  });

  readonly repositoryCode = computed(() => {
    if (this.mode() === 'instance') {
      return this.workflowService.selectedInstanceDetail()?.instance.processCode ?? this.routeInstanceId();
    }
    return this.task()?.processCode ?? '';
  });

  readonly activityName = computed(() => (this.mode() === 'task' ? this.task()?.taskName ?? '' : ''));

  readonly backLink = computed(() => {
    if (this.mode() === 'instance') {
      return '/workflow/tramites';
    }
    const taskId = this.taskId();
    return taskId ? `/workflow/bandeja/${taskId}` : '/workflow/bandeja';
  });

  readonly backLabel = computed(() => (this.mode() === 'instance' ? 'Mis trámites' : 'Volver a la actividad'));

  constructor() {
    effect(() => {
      if (this.mode() === 'task') {
        const task = this.task();
        if (!task) {
          return;
        }
        this.workflowService.loadInstanceDocuments(task.instanceId);
        this.workflowService.loadTaskDocuments(task.id);
        return;
      }

      const instanceId = this.routeInstanceId();
      if (instanceId) {
        this.workflowService.loadInstanceDetail(instanceId);
        this.workflowService.loadInstanceDocuments(instanceId);
      }
    });
  }

  onUploadDocument(payload: { name: string; comment: string; file: File; target: 'tramite' | 'actividad' }): void {
    if (this.mode() === 'instance') {
      const instanceId = this.routeInstanceId();
      if (!instanceId) {
        return;
      }
      this.workflowService.uploadInstanceDocument(instanceId, payload.file, payload.name, payload.comment);
      return;
    }

    const task = this.task();
    if (!task) {
      return;
    }

    if (payload.target === 'tramite') {
      this.workflowService.uploadInstanceDocument(task.instanceId, payload.file, payload.name, payload.comment);
      return;
    }

    this.workflowService.uploadTaskDocument(task.id, payload.file, payload.name, payload.comment);
  }

  onUploadVersion(payload: { documentId: string; file: File; comment: string; target: 'tramite' | 'actividad' }): void {
    this.workflowService.uploadDocumentVersion(payload.documentId, payload.file, payload.comment, payload.target === 'actividad' ? 'task' : 'instance');
  }

  downloadDocument(documentId: string, name: string): void {
    this.workflowService.downloadDocument(documentId, name);
  }

  openVersion(payload: { documentId: string; versionId: string; fileName: string }): void {
    this.workflowService.openDocumentVersion(payload.documentId, payload.versionId, payload.fileName);
  }

  signVersion(payload: { documentId: string; versionId: string }): void {
    this.workflowService.signDocumentVersion(payload.documentId, payload.versionId, 'Aprobado desde repositorio');
  }

  validateVersion(payload: { documentId: string; versionId: string }): void {
    this.workflowService.validateDocumentSignature(payload.documentId, payload.versionId);
  }

  loadComments(documentId: string): void {
    this.workflowService.loadDocumentComments(documentId);
  }

  addComment(payload: { documentId: string; comment: string }): void {
    this.workflowService.addDocumentComment(payload.documentId, payload.comment);
  }

  handleRealtimeDocumentEvent(event: { documentId: string; type: string }): void {
    this.workflowService.loadDocumentVersions(event.documentId);
    this.workflowService.loadDocumentComments(event.documentId);
    if (this.mode() === 'instance') {
      const instanceId = this.routeInstanceId();
      if (instanceId) {
        this.workflowService.loadInstanceDocuments(instanceId);
      }
      return;
    }
    const task = this.task();
    if (task) {
      this.workflowService.loadInstanceDocuments(task.instanceId);
      this.workflowService.loadTaskDocuments(task.id);
    }
  }

  onOpenPreview(document: WorkflowDocument): void {
    void this.router.navigate(['/workflow/documentos', document.id, 'vista'], {
      queryParams: { returnUrl: this.router.url },
      state: { document },
    });
  }

  onOpenEditor(document: WorkflowDocument): void {
    void this.router.navigate(['/workflow/documentos', document.id, 'editar'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
