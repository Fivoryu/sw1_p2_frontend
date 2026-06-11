import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DocumentPreviewViewComponent } from '../../shared/components/documents/document-preview-view.component';
import { WorkflowDocument, WorkflowDocumentVersion } from '../../core/models/workflow.models';
import { WorkflowService } from '../../core/services/workflow.service';
import { changeTypeLabel, formatFileSize, mimeTypeLabel, mimeTypeKind, scopeLabel } from '../../shared/utils/file-format.utils';

@Component({
  selector: 'app-workflow-document-preview-page',
  standalone: true,
  imports: [CommonModule, DocumentPreviewViewComponent],
  templateUrl: './workflow-document-preview-page.component.html',
  styleUrl: './workflow-document-preview-page.component.scss',
})
export class WorkflowDocumentPreviewPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly workflowService = inject(WorkflowService);

  readonly documentId = toSignal(this.route.paramMap.pipe(map((params) => params.get('documentId') ?? '')), {
    initialValue: '',
  });

  readonly returnUrl = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('returnUrl') ?? '/workflow/bandeja')), {
    initialValue: '/workflow/bandeja',
  });

  readonly documentMeta = signal<WorkflowDocument | null>(null);

  readonly isEditableText = computed(() => {
    const doc = this.documentMeta();
    if (!doc) return false;
    const kind = mimeTypeKind(doc.mimeType);
    return kind === 'text';
  });

  readonly title = computed(() => this.documentMeta()?.fileName || this.documentMeta()?.name || 'Vista previa');
  readonly subtitle = computed(() => {
    const document = this.documentMeta();
    if (!document) {
      return '';
    }
    return `${changeTypeLabel(document.changeType)} · ${document.uploadedByName} · ${document.uploadedAtLabel}`;
  });

  formatFileSize = formatFileSize;
  mimeTypeLabel = mimeTypeLabel;
  scopeLabel = scopeLabel;

  constructor() {
    const navigationDocument = this.readNavigationDocument();
    if (navigationDocument) {
      this.documentMeta.set(navigationDocument);
    }

    effect(() => {
      const documentId = this.documentId();
      if (!documentId) {
        return;
      }

      const current = this.documentMeta();
      if (current?.id === documentId) {
        return;
      }

      const cachedVersions = this.workflowService.selectedDocumentVersions()[documentId];
      if (cachedVersions?.length) {
        this.documentMeta.set(this.buildDocumentMeta(documentId, cachedVersions[0]));
        return;
      }

      this.workflowService.loadDocumentVersions(documentId);
    });

    effect(() => {
      const documentId = this.documentId();
      if (!documentId || this.documentMeta()?.id === documentId) {
        return;
      }

      const versions = this.workflowService.selectedDocumentVersions()[documentId];
      if (versions?.length) {
        this.documentMeta.set(this.buildDocumentMeta(documentId, versions[0]));
      }
    });
  }

  goBack(): void {
    void this.router.navigateByUrl(this.returnUrl());
  }

  downloadDocument(): void {
    const document = this.documentMeta();
    if (!document) {
      return;
    }
    this.workflowService.downloadDocument(document.id, document.fileName || document.name);
  }

  editDocument(): void {
    const document = this.documentMeta();
    if (!document) return;
    const returnUrl = this.returnUrl();
    const query = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    void this.router.navigate(['/workflow/documentos', document.id, 'editar'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  private readNavigationDocument(): WorkflowDocument | null {
    const stateDocument = this.router.getCurrentNavigation()?.extras?.state?.['document'] as WorkflowDocument | undefined;
    if (stateDocument) {
      return stateDocument;
    }
    if (typeof history !== 'undefined') {
      return (history.state?.['document'] as WorkflowDocument | undefined) ?? null;
    }
    return null;
  }

  private buildDocumentMeta(documentId: string, latest: WorkflowDocumentVersion): WorkflowDocument {
    return {
      id: documentId,
      name: latest.fileName.replace(/\.[^.]+$/, '') || latest.fileName,
      version: latest.version,
      uploadedByName: latest.uploadedByName,
      uploadedAtLabel: latest.uploadedAtLabel,
      mimeType: latest.mimeType,
      sizeBytes: latest.sizeBytes,
      comment: latest.comment,
      scope: 'case',
      fileName: latest.fileName,
      changeType: latest.changeType,
      createdByName: latest.uploadedByName,
    };
  }
}
