import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import {
  WorkflowCatalogEntry,
  WorkflowCatalogEntryApi,
  WorkflowCase,
  WorkflowCaseApi,
  WorkflowDocument,
  WorkflowDocumentComment,
  WorkflowDocumentCommentApi,
  WorkflowDocumentCommentListApi,
  WorkflowDocumentApi,
  WorkflowDocumentListApi,
  WorkflowDocumentVersion,
  WorkflowDocumentVersionApi,
  WorkflowVersionCompareApi,
  WorkflowDocumentSignatureApi,
  WorkflowDocumentSignatureValidationApi,
  WorkflowDocumentPermissionCreateApi,
  WorkflowDocumentPermissionApi,
  WorkflowDocumentPermissionListApi,
  WorkflowDocumentVersionListApi,
  WorkflowTaskDocumentListApi,
  WorkflowInstanceDetail,
  WorkflowInstanceDetailApi,
  WorkflowKpiApi,
  WorkflowKpiSummary,
  WorkflowStartResponse,
  WorkflowTaskCompleteResponse,
  WorkflowTaskDetailApi,
  WorkflowTaskForm,
  WorkflowTask,
  WorkflowTaskApi,
} from '../models/workflow.models';
import { hydrateWorkflowTaskForm } from '../models/policy-form-field.config';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { sortTasksByAiPriority } from '../../shared/utils/task-priority.utils';

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);

  private readonly inboxTasksState = signal<WorkflowTask[]>([]);
  private readonly activeCasesState = signal<WorkflowCase[]>([]);
  private readonly catalogState = signal<WorkflowCatalogEntry[]>([]);
  private readonly selectedInstanceDetailState = signal<WorkflowInstanceDetail | null>(null);
  private readonly selectedInstanceDocumentsState = signal<WorkflowDocument[]>([]);
  private readonly selectedTaskDocumentsState = signal<WorkflowDocument[]>([]);
  private readonly selectedDocumentVersionsState = signal<Record<string, WorkflowDocumentVersion[]>>({});
  private readonly selectedDocumentCommentsState = signal<Record<string, WorkflowDocumentComment[]>>({});
  private readonly kpiState = signal<WorkflowKpiSummary | null>(null);
  private readonly selectedTaskFormState = signal<WorkflowTaskForm | null>(null);
  private readonly selectedTaskResponsesState = signal<Record<string, unknown>>({});
  private readonly loadedTaskDetailIdState = signal<string | null>(null);

  readonly loading = signal(false);
  readonly loadingError = signal('');
  readonly creating = signal(false);
  readonly uploadingDocument = signal(false);
  readonly claimingTaskId = signal<string | null>(null);
  readonly loadingTaskDetailId = signal<string | null>(null);
  readonly completingTaskId = signal<string | null>(null);
  readonly createError = signal('');
  readonly successNotice = signal('');
  readonly lastStartedCaseCode = signal('');

  readonly currentDepartmentName = computed(() => this.authService.getCurrentUser()?.department_name ?? 'Sin departamento');
  readonly currentDepartmentId = computed(() => this.authService.getCurrentUser()?.department_id ?? '');
  readonly currentUserName = computed(() => this.authService.getCurrentUser()?.full_name ?? 'Funcionario');
  readonly currentUserId = computed(() => this.authService.getCurrentUser()?.id ?? '');
  readonly canReadDocuments = computed(() => this.authService.canReadDocuments());
  readonly canWriteDocuments = computed(() => this.authService.canWriteDocuments());
  readonly canSignDocuments = computed(() => this.authService.canSignDocuments());
  readonly canValidateDocumentSignatures = computed(() => this.authService.canValidateDocumentSignatures());
  readonly canAdminDocuments = computed(() => this.authService.canAdminDocuments());
  readonly inboxTasks = computed(() => this.inboxTasksState());
  readonly activeCases = computed(() => this.activeCasesState());
  readonly catalog = computed(() => this.catalogState());
  readonly selectedInstanceDetail = computed(() => this.selectedInstanceDetailState());
  readonly selectedInstanceDocuments = computed(() => this.selectedInstanceDocumentsState());
  readonly selectedTaskDocuments = computed(() => this.selectedTaskDocumentsState());
  readonly selectedDocumentVersions = computed(() => this.selectedDocumentVersionsState());
  readonly selectedDocumentComments = computed(() => this.selectedDocumentCommentsState());
  readonly kpis = computed(() => this.kpiState());
  readonly selectedTaskForm = computed(() => this.selectedTaskFormState());
  readonly selectedTaskResponses = computed(() => this.selectedTaskResponsesState());

  constructor() {
    effect(() => {
      if (!this.authService.isAuthenticated() || !this.authService.canAccessWorkflowPortal()) {
        return;
      }
      this.refreshAll();
    });
  }

  refreshAll(): void {
    this.loading.set(true);
    this.loadingError.set('');
    this.loadCatalog();
    this.loadCases();
    this.loadInbox();
    this.loadKpis();
  }

  startWorkflow(policyId: string, summary?: string): void {
    if (this.creating()) {
      return;
    }

    this.creating.set(true);
    this.createError.set('');
    this.successNotice.set('');
    this.lastStartedCaseCode.set('');
    this.api
      .post<WorkflowStartResponse>('/workflow/instances', {
        policy_id: policyId,
        summary: summary ?? '',
      })
      .subscribe({
        next: (result) => {
          this.lastStartedCaseCode.set(result.instance.case_code);
          this.successNotice.set(`Trámite ${result.instance.case_code} iniciado correctamente.`);
          this.activeCasesState.update((items) => [this.mapCase(result.instance), ...items.filter((item) => item.id !== result.instance.id)]);
          this.inboxTasksState.update((items) => [this.mapTask(result.first_task), ...items.filter((item) => item.id !== result.first_task.id)]);
          this.creating.set(false);
          this.loadCases();
          this.loadInbox();
          this.loadKpis();
        },
        error: (error) => {
          this.creating.set(false);
          this.createError.set(error?.error?.detail ?? 'No se pudo iniciar el trámite');
        },
      });
  }

  claimTask(taskId: string, onSuccess?: () => void): void {
    if (this.claimingTaskId()) {
      return;
    }

    this.claimingTaskId.set(taskId);
    this.createError.set('');
    this.successNotice.set('');
    this.api.post<WorkflowTaskApi>(`/workflow/tasks/${taskId}/claim`, {}).subscribe({
      next: (task) => {
        const mapped = this.mapTask(task);
        this.inboxTasksState.update((items) => items.map((item) => (item.id === mapped.id ? mapped : item)));
        this.claimingTaskId.set(null);
        this.successNotice.set(`Tarea ${mapped.taskName} reclamada correctamente.`);
        this.loadInbox();
        onSuccess?.();
      },
      error: (error) => {
        this.claimingTaskId.set(null);
        this.createError.set(error?.error?.detail ?? 'No se pudo reclamar la tarea');
      },
    });
  }

  refreshTaskSummary(taskId: string): void {
    if (!taskId) {
      return;
    }

    this.api.get<WorkflowTaskDetailApi>(`/workflow/tasks/${taskId}`).subscribe({
      next: (detail) => {
        const mapped = this.mapTask(detail.task);
        this.inboxTasksState.update((items) => {
          const exists = items.some((item) => item.id === mapped.id);
          return exists ? items.map((item) => (item.id === mapped.id ? mapped : item)) : [mapped, ...items];
        });
      },
      error: () => undefined,
    });
  }

  loadTaskDetail(taskId: string, force = false): void {
    if (!taskId) {
      return;
    }

    if (!force) {
      if (this.loadingTaskDetailId() === taskId) {
        return;
      }
      if (this.loadedTaskDetailIdState() === taskId && this.selectedTaskFormState()) {
        return;
      }
    }

    this.loadingTaskDetailId.set(taskId);
    this.createError.set('');
    this.api.get<WorkflowTaskDetailApi>(`/workflow/tasks/${taskId}`).subscribe({
      next: (detail) => {
        const mapped = this.mapTask(detail.task);
        this.inboxTasksState.update((items) => {
          const exists = items.some((item) => item.id === mapped.id);
          return exists ? items.map((item) => (item.id === mapped.id ? mapped : item)) : [mapped, ...items];
        });
        this.selectedTaskFormState.set(hydrateWorkflowTaskForm(detail.form));
        this.selectedTaskResponsesState.update((current) => ({
          ...(detail.responses ?? {}),
          ...current,
        }));
        this.loadedTaskDetailIdState.set(taskId);
        this.loadTaskDocuments(taskId);
        this.loadingTaskDetailId.set(null);
      },
      error: (error) => {
        this.loadingTaskDetailId.set(null);
        if (this.loadedTaskDetailIdState() === taskId) {
          this.loadedTaskDetailIdState.set(null);
        }
        this.selectedTaskFormState.set(null);
        this.selectedTaskResponsesState.set({});
        this.createError.set(error?.error?.detail ?? 'No se pudo cargar el formulario de la tarea');
      },
    });
  }

  clearSelectedTaskDetail(): void {
    this.selectedTaskFormState.set(null);
    this.selectedTaskResponsesState.set({});
    this.selectedTaskDocumentsState.set([]);
    this.selectedDocumentVersionsState.set({});
    this.loadedTaskDetailIdState.set(null);
  }

  loadInstanceDetail(instanceId: string): void {
    this.loading.set(true);
    this.loadingError.set('');
    this.api.get<WorkflowInstanceDetailApi>(`/workflow/instances/${instanceId}`).subscribe({
      next: (detail) => {
        this.selectedInstanceDetailState.set({
          instance: this.mapCase(detail.instance),
          diagram: detail.diagram,
          tasks: detail.tasks.map((task) => this.mapTask(task)),
        });
        this.loadInstanceDocuments(instanceId);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.loadingError.set(error?.error?.detail ?? 'No se pudo cargar el detalle del trámite');
      },
    });
  }

  loadInstanceDocuments(instanceId: string): void {
    this.api.get<WorkflowDocumentListApi>(`/documents/instances/${instanceId}`).subscribe({
      next: (payload) => this.selectedInstanceDocumentsState.set(payload.documents.map((item) => this.mapDocument(item))),
      error: (error) => this.loadingError.set(error?.error?.detail ?? 'No se pudo cargar el repositorio documental'),
    });
  }

  uploadInstanceDocument(instanceId: string, file: File, name?: string, comment?: string): void {
    const formData = new FormData();
    formData.append('file', file);
    if (name?.trim()) {
      formData.append('name', name.trim());
    }
    if (comment?.trim()) {
      formData.append('comment', comment.trim());
    }

    this.uploadingDocument.set(true);
    this.createError.set('');
    this.successNotice.set('');
    this.api.post<WorkflowDocumentApi>(`/documents/instances/${instanceId}/upload`, formData).subscribe({
      next: (document) => {
        const mapped = this.mapDocument(document);
        this.selectedInstanceDocumentsState.update((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
        this.uploadingDocument.set(false);
        this.successNotice.set(`Documento ${mapped.name} subido correctamente.`);
      },
      error: (error) => {
        this.uploadingDocument.set(false);
        this.createError.set(error?.error?.detail ?? 'No se pudo subir el documento');
      },
    });
  }

  loadTaskDocuments(taskId: string): void {
    this.api.get<WorkflowTaskDocumentListApi>(`/documents/tasks/${taskId}`).subscribe({
      next: (payload) => this.selectedTaskDocumentsState.set(payload.documents.map((item) => this.mapDocument(item))),
      error: (error) => this.createError.set(error?.error?.detail ?? 'No se pudieron cargar los documentos de la tarea'),
    });
  }

  uploadTaskDocument(taskId: string, file: File, name?: string, comment?: string): void {
    const formData = new FormData();
    formData.append('file', file);
    if (name?.trim()) {
      formData.append('name', name.trim());
    }
    if (comment?.trim()) {
      formData.append('comment', comment.trim());
    }

    this.uploadingDocument.set(true);
    this.createError.set('');
    this.successNotice.set('');
    this.api.post<WorkflowDocumentApi>(`/documents/tasks/${taskId}/upload`, formData).subscribe({
      next: (document) => {
        const mapped = this.mapDocument(document);
        this.selectedTaskDocumentsState.update((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
        this.uploadingDocument.set(false);
        this.successNotice.set(`Documento ${mapped.name} adjuntado a la actividad.`);
      },
      error: (error) => {
        this.uploadingDocument.set(false);
        this.createError.set(error?.error?.detail ?? 'No se pudo adjuntar el documento a la tarea');
      },
    });
  }

  uploadDocumentVersion(documentId: string, file: File, comment?: string, target: 'instance' | 'task' = 'instance'): void {
    const formData = new FormData();
    formData.append('file', file);
    if (comment?.trim()) {
      formData.append('comment', comment.trim());
    }

    this.uploadingDocument.set(true);
    this.createError.set('');
    this.successNotice.set('');
    this.api.post<WorkflowDocumentApi>(`/documents/${documentId}/versions`, formData).subscribe({
      next: (document) => {
        const mapped = this.mapDocument(document);
        if (target === 'task') {
          this.selectedTaskDocumentsState.update((items) => items.map((item) => (item.id === mapped.id ? mapped : item)));
        } else {
          this.selectedInstanceDocumentsState.update((items) => items.map((item) => (item.id === mapped.id ? mapped : item)));
        }
        this.loadDocumentVersions(documentId);
        this.uploadingDocument.set(false);
        this.successNotice.set(`Nueva versión subida para ${mapped.name}.`);
      },
      error: (error) => {
        this.uploadingDocument.set(false);
        this.createError.set(error?.error?.detail ?? 'No se pudo subir la nueva versión');
      },
    });
  }

  openDocument(documentId: string, fileName: string): void {
    this.api.getBlob(`/documents/${documentId}/content`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        this.createError.set(error?.error?.detail ?? `No se pudo abrir ${fileName}`);
      },
    });
  }

  loadDocumentVersions(documentId: string): void {
    this.api.get<WorkflowDocumentVersionListApi>(`/documents/${documentId}/versions`).subscribe({
      next: (payload) => {
        this.selectedDocumentVersionsState.update((current) => ({
          ...current,
          [documentId]: payload.versions.map((item) => this.mapDocumentVersion(item)),
        }));
      },
      error: (error) => {
        this.createError.set(error?.error?.detail ?? 'No se pudo cargar el historial de versiones');
      },
    });
  }

  loadDocumentComments(documentId: string): void {
    this.api.get<WorkflowDocumentCommentListApi>(`/documents/${documentId}/comments`).subscribe({
      next: (payload) => {
        this.selectedDocumentCommentsState.update((current) => ({
          ...current,
          [documentId]: payload.comments.map((item) => this.mapDocumentComment(item)),
        }));
      },
      error: (error) => this.createError.set(error?.error?.detail ?? 'No se pudieron cargar los comentarios del documento'),
    });
  }

  addDocumentComment(documentId: string, comment: string, versionId?: string | null): void {
    const formData = new FormData();
    formData.append('comment', comment.trim());
    if (versionId) {
      formData.append('version_id', versionId);
    }
    this.api.post<WorkflowDocumentCommentApi>(`/documents/${documentId}/comments`, formData).subscribe({
      next: (created) => {
        const mapped = this.mapDocumentComment(created);
        this.selectedDocumentCommentsState.update((current) => ({
          ...current,
          [documentId]: [...(current[documentId] ?? []), mapped],
        }));
        this.successNotice.set('Comentario registrado correctamente.');
      },
      error: (error) => this.createError.set(error?.error?.detail ?? 'No se pudo registrar el comentario'),
    });
  }

  loadDocumentVersionsForAll(documentIds: string[]): void {
    for (const documentId of documentIds) {
      if (documentId) {
        this.loadDocumentVersions(documentId);
      }
    }
  }

  downloadDocument(documentId: string, fileName: string): void {
    this.api.getBlob(`/documents/${documentId}/content`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        this.createError.set(error?.error?.detail ?? `No se pudo descargar ${fileName}`);
      },
    });
  }

  openDocumentVersion(documentId: string, versionId: string, fileName: string): void {
    this.api.getBlob(`/documents/${documentId}/versions/${versionId}/content`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (error) => this.createError.set(error?.error?.detail ?? `No se pudo abrir la versión de ${fileName}`),
    });
  }

  signDocumentVersion(documentId: string, versionId: string, reason?: string, onSuccess?: (result: WorkflowDocumentSignatureApi) => void): void {
    const formData = new FormData();
    if (reason?.trim()) {
      formData.append('reason', reason.trim());
    }
    this.api.post<WorkflowDocumentSignatureApi>(`/documents/${documentId}/versions/${versionId}/sign`, formData).subscribe({
      next: (result) => {
        this.successNotice.set(`Versión v${result.version_number} firmada correctamente.`);
        onSuccess?.(result);
      },
      error: (error) => this.createError.set(error?.error?.detail ?? 'No se pudo firmar la versión documental'),
    });
  }

  validateDocumentSignature(documentId: string, versionId: string, onSuccess?: (result: WorkflowDocumentSignatureValidationApi) => void): void {
    this.api.get<WorkflowDocumentSignatureValidationApi>(`/documents/${documentId}/versions/${versionId}/signature/validate`).subscribe({
      next: (result) => {
        this.successNotice.set(result.valid ? `Firma válida para v${result.version_number}.` : `Firma inválida para v${result.version_number}.`);
        onSuccess?.(result);
      },
      error: (error) => this.createError.set(error?.error?.detail ?? 'No se pudo validar la firma documental'),
    });
  }

  compareVersions(documentId: string, fromVersion: number, toVersion: number): Observable<WorkflowVersionCompareApi> {
    return this.api.get<WorkflowVersionCompareApi>(`/documents/${documentId}/versions/compare?from=${fromVersion}&to=${toVersion}`);
  }

  getDocumentPermissions(documentId: string): Observable<WorkflowDocumentPermissionListApi> {
    return this.api.get<WorkflowDocumentPermissionListApi>(`/documents/${documentId}/permissions`);
  }

  grantDocumentPermission(documentId: string, payload: WorkflowDocumentPermissionCreateApi): Observable<WorkflowDocumentPermissionApi> {
    return this.api.post<WorkflowDocumentPermissionApi>(`/documents/${documentId}/permissions`, payload).pipe(
      tap(() => this.successNotice.set('Permiso documental actualizado.')),
    );
  }

  revokeDocumentPermission(documentId: string, permissionId: string): Observable<void> {
    return this.api.delete<void>(`/documents/${documentId}/permissions/${permissionId}`).pipe(
      tap(() => this.successNotice.set('Permiso documental revocado.')),
    );
  }

  updateSelectedTaskResponse(fieldName: string, value: unknown): void {
    this.selectedTaskResponsesState.update((current) => ({ ...current, [fieldName]: value }));
  }

  completeTask(taskId: string, onSuccess?: (result: WorkflowTaskCompleteResponse) => void, recommendedUserId?: string | null): void {
    if (this.completingTaskId()) {
      return;
    }

    this.completingTaskId.set(taskId);
    this.createError.set('');
    this.successNotice.set('');
    this.api.post<WorkflowTaskCompleteResponse>(`/workflow/tasks/${taskId}/complete`, { responses: this.selectedTaskResponses(), recommended_user_id: recommendedUserId ?? null }).subscribe({
      next: (result) => {
        this.completingTaskId.set(null);
        this.selectedTaskFormState.set(null);
        this.selectedTaskResponsesState.set({});
        this.loadedTaskDetailIdState.set(null);
        this.inboxTasksState.update((items) => {
          const withoutCompleted = items.filter((item) => item.id !== result.completed_task.id);
          return result.next_task ? [this.mapTask(result.next_task), ...withoutCompleted] : withoutCompleted;
        });
        this.activeCasesState.update((items) => [this.mapCase(result.instance), ...items.filter((item) => item.id !== result.instance.id)]);
        if (this.selectedInstanceDetailState()?.instance.id === result.instance.id) {
          this.loadInstanceDetail(result.instance.id);
        }
        this.loadCases();
        this.loadInbox();
        this.loadKpis();
        this.successNotice.set(
          result.next_task
            ? `Tarea completada. El trámite pasó a ${result.next_task.department_name ?? 'la siguiente área'}.`
            : `Tarea completada. El trámite ${result.instance.case_code} finalizó correctamente.`,
        );
        onSuccess?.(result);
      },
      error: (error) => {
        this.completingTaskId.set(null);
        this.createError.set(error?.error?.detail ?? 'No se pudo completar la tarea');
      },
    });
  }

  findInboxTask(taskId: string): WorkflowTask | null {
    return this.inboxTasksState().find((task) => task.id === taskId) ?? null;
  }

  private loadCatalog(): void {
    this.api
      .get<WorkflowCatalogEntryApi[]>('/workflow/catalog')
      .pipe(tap(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.catalogState.set(items.map((item) => this.mapCatalog(item))),
        error: (error) => {
          this.loading.set(false);
          this.loadingError.set(error?.error?.detail ?? 'No se pudo cargar el catálogo workflow');
        },
      });
  }

  getFollowedInstances(status?: string): Observable<WorkflowCase[]> {
    let url = '/workflow/instances/following';
    if (status) {
      url += `?status_filter=${encodeURIComponent(status)}`;
    }
    return this.api.get<WorkflowCaseApi[]>(url).pipe(
      map((items) => items.map((item) => this.mapCase(item))),
    );
  }

  private loadCases(): void {
    this.api.get<WorkflowCaseApi[]>('/workflow/instances/my').subscribe({
      next: (items) => this.activeCasesState.set(items.map((item) => this.mapCase(item))),
      error: (error) => this.loadingError.set(error?.error?.detail ?? 'No se pudieron cargar los trámites'),
    });
  }

  private loadInbox(): void {
    this.api.get<WorkflowTaskApi[]>('/workflow/tasks/my-inbox').subscribe({
      next: (items) => this.inboxTasksState.set(sortTasksByAiPriority(items.map((item) => this.mapTask(item)))),
      error: (error) => this.loadingError.set(error?.error?.detail ?? 'No se pudo cargar la bandeja'),
    });
  }

  private loadKpis(): void {
    this.api.get<WorkflowKpiApi>('/workflow/kpis').subscribe({
      next: (kpis) => {
        this.kpiState.set({
          totalInstances: kpis.total_instances,
          activeInstances: kpis.active_instances,
          completedInstances: kpis.completed_instances,
          instancesByStatus: kpis.instances_by_status,
          pendingByDepartment: kpis.pending_by_department.map((item) => ({
            departmentName: item.department_name,
            pendingTasks: item.pending_tasks,
          })),
        });
      },
      error: (error) => this.loadingError.set(error?.error?.detail ?? 'No se pudieron cargar los KPI del workflow'),
    });
  }

  private mapTask(item: WorkflowTaskApi): WorkflowTask {
    return {
      id: item.id,
      instanceId: item.instance_id,
      processCode: item.case_code,
      policyName: item.policy_name,
      taskName: item.task_name,
      requesterName: item.requester_name,
      requesterType: item.requester_email?.endsWith('@example.com') ? 'interno' : 'externo',
      departmentName: item.department_name ?? 'Sin departamento',
      assignedUserId: item.assigned_user_id,
      assignedUserName: item.assigned_user_name,
      priority: this.normalizePriority(item.priority),
      status: this.normalizeTaskStatus(item.status),
      dueLabel: `Creado ${this.toShortDate(item.created_at)}`,
      createdAtLabel: this.toShortDateTime(item.created_at),
      slaLabel: 'SLA inicial activo',
      summary: item.summary || 'Tarea creada desde política publicada.',
      nextAction: item.next_action || 'Continuar la ejecución del flujo.',
      checklist: item.checklist?.length ? item.checklist : ['Revisar contexto', 'Abrir formulario asociado', 'Continuar flujo'],
      formId: item.form_id,
      priorityScore: item.priority_score ?? null,
      aiPriorityLevel: item.ai_priority_level ?? null,
      delayRiskLevel: item.delay_risk_level ?? null,
      delayRiskScore: item.delay_risk_score ?? null,
      priorityReasons: item.priority_reasons ?? [],
      recommendedActions: item.recommended_actions ?? [],
      routeRecommendation: item.route_recommendation ?? null,
    };
  }

  private mapCase(item: WorkflowCaseApi): WorkflowCase {
    return {
      id: item.id,
      processCode: item.case_code,
      policyName: item.policy_name,
      currentStage: item.current_task_name ?? 'Sin tarea actual',
      currentDepartment: item.current_department_name ?? 'Sin departamento',
      startedAtLabel: this.toShortDateTime(item.started_at),
      updatedAtLabel: this.toShortDateTime(item.updated_at),
      progress: item.progress,
      riskLevel: item.risk_level ?? 'bajo',
      anomalyFlags: item.anomaly_flags ?? [],
      ownerName: item.requester_name,
      status: this.normalizeCaseStatus(item.status),
      milestone: item.subject || item.summary || 'Instancia iniciada desde política publicada.',
    };
  }

  private mapCatalog(item: WorkflowCatalogEntryApi): WorkflowCatalogEntry {
    return {
      id: item.id,
      policyName: item.name,
      category: item.category,
      targetDepartment: item.target_department_name ?? 'Sin departamento',
      durationLabel: `${Math.max(1, item.steps_count)} pasos base`,
      steps: item.steps_count,
      forms: item.forms_count,
      summary: item.description,
      launchHint: item.target_department_name
        ? `La primera tarea llegará a ${item.target_department_name}.`
        : 'La primera tarea se asignará según el diagrama publicado.',
    };
  }

  private mapDocument(item: WorkflowDocumentApi): WorkflowDocument {
    return {
      id: item.id,
      name: item.name,
      version: item.current_version,
      uploadedByName: item.latest_version.uploaded_by_name,
      uploadedAtLabel: this.toShortDateTime(item.latest_version.created_at),
      mimeType: item.latest_version.mime_type,
      sizeBytes: item.latest_version.size_bytes,
      comment: item.latest_version.comment,
      scope: item.scope,
      fileName: item.latest_version.file_name,
      changeType: item.latest_version.change_type,
      createdByName: item.created_by_name,
    };
  }

  private mapDocumentVersion(item: WorkflowDocumentVersionApi): WorkflowDocumentVersion {
    return {
      id: item.id,
      version: item.version_number,
      fileName: item.file_name,
      mimeType: item.mime_type,
      sha256: item.sha256,
      uploadedByName: item.uploaded_by_name,
      uploadedAtLabel: this.toShortDateTime(item.created_at),
      comment: item.comment,
      changeType: item.change_type,
      sizeBytes: item.size_bytes,
    };
  }

  private mapDocumentComment(item: WorkflowDocumentCommentApi): WorkflowDocumentComment {
    return {
      id: item.id,
      documentId: item.document_id,
      versionId: item.version_id,
      comment: item.comment,
      authorName: item.author_name,
      authorRole: item.author_role,
      createdAtLabel: this.toShortDateTime(item.created_at),
    };
  }

  private normalizePriority(value: string): WorkflowTask['priority'] {
    if (value === 'alta' || value === 'baja') {
      return value;
    }
    return 'media';
  }

  private normalizeTaskStatus(value: string): WorkflowTask['status'] {
    if (value === 'claimed') {
      return 'reclamada';
    }
    if (value === 'in_progress') {
      return 'en_progreso';
    }
    if (value === 'pending') {
      return 'pendiente';
    }
    return 'nueva';
  }

  private normalizeCaseStatus(value: string): WorkflowCase['status'] {
    if (value === 'active') {
      return 'activo';
    }
    if (value === 'review') {
      return 'en_revision';
    }
    return 'por_iniciar';
  }

  private toShortDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private toShortDate(value: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'medium',
    }).format(new Date(value));
  }
}
