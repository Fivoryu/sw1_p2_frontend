import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, HostListener, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DocumentVersionHistoryEntry, WorkflowDocument, WorkflowDocumentComment, WorkflowDocumentVersion } from '../../../core/models/workflow.models';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentCollabService } from '../../../core/services/document-collab.service';
import { DocumentVersionCompareComponent } from './document-version-compare.component';
import { DocumentPermissionsModalComponent } from './document-permissions-modal.component';
import { DocumentPreviewViewComponent } from './document-preview-view.component';
import {
  changeTypeLabel,
  fileKindLabel,
  formatFileSize,
  mimeTypeKind,
  mimeTypeLabel,
  scopeLabel,
  versionStatusLabel,
} from '../../utils/file-format.utils';

export type DocumentRepositoryTab = 'tramite' | 'actividad';
export type DocumentRepositorySection = 'files' | 'history';

@Component({
  selector: 'app-document-repository-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DocumentPreviewViewComponent, DocumentVersionCompareComponent, DocumentPermissionsModalComponent],
  templateUrl: './document-repository-panel.component.html',
  styleUrl: './document-repository-panel.component.scss',
})
export class DocumentRepositoryPanelComponent implements OnDestroy {
  private readonly documentRef = inject(DOCUMENT);
  private readonly authService = inject(AuthService);
  readonly documentCollab = inject(DocumentCollabService);
  private readonly collabSubscription: Subscription;
  readonly repositoryCode = input('');
  readonly activityName = input('');
  readonly documents = input<WorkflowDocument[]>([]);
  readonly tramiteDocuments = input<WorkflowDocument[] | null>(null);
  readonly versionsByDocument = input<Record<string, WorkflowDocumentVersion[]>>({});
  readonly commentsByDocument = input<Record<string, WorkflowDocumentComment[]>>({});
  readonly canWrite = input(false);
  readonly canSign = input(false);
  readonly canValidateSignature = input(false);
  readonly canAdminDocuments = input(false);
  readonly uploading = input(false);

  readonly uploadDocument = output<{ name: string; comment: string; file: File; target: DocumentRepositoryTab }>();
  readonly uploadVersion = output<{ documentId: string; file: File; comment: string; target: DocumentRepositoryTab }>();
  readonly downloadDocument = output<{ documentId: string; name: string }>();
  readonly loadVersions = output<string>();
  readonly loadAllVersions = output<string[]>();
  readonly openPreview = output<WorkflowDocument>();
  readonly openVersion = output<{ documentId: string; versionId: string; fileName: string }>();
  readonly signVersion = output<{ documentId: string; versionId: string }>();
  readonly validateVersion = output<{ documentId: string; versionId: string }>();
  readonly loadComments = output<string>();
  readonly addComment = output<{ documentId: string; comment: string }>();
  readonly openEditor = output<WorkflowDocument>();
  readonly realtimeDocumentEvent = output<{ documentId: string; type: string }>();

  readonly activeTab = signal<DocumentRepositoryTab>('actividad');
  readonly repoSection = signal<DocumentRepositorySection>('files');
  readonly historyDocumentFilterId = signal<string | null>(null);
  readonly previewDocument = signal<WorkflowDocument | null>(null);
  readonly compareDocumentId = signal<string | null>(null);
  readonly permissionsDocumentId = signal<string | null>(null);
  readonly showUploadPanel = signal(false);
  readonly documentName = signal('');
  readonly documentComment = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly versionFileByDocument = signal<Record<string, File | null>>({});
  readonly versionCommentByDocument = signal<Record<string, string>>({});
  readonly commentDraft = signal('');
  readonly dragOver = signal(false);
  readonly previewComments = computed(() => {
    const document = this.previewDocument();
    if (!document) {
      return [];
    }
    return this.commentsByDocument()[document.id] ?? [];
  });

  readonly dualRepository = computed(() => this.tramiteDocuments() != null);
  readonly visibleDocuments = computed(() => {
    if (this.tramiteDocuments()) {
      return this.activeTab() === 'tramite' ? this.tramiteDocuments() ?? [] : this.documents();
    }
    return this.documents();
  });

  readonly historyEntries = computed(() => {
    const entries: DocumentVersionHistoryEntry[] = [];
    for (const document of this.visibleDocuments()) {
      const versions = this.versionsByDocument()[document.id] ?? [];
      entries.push(...this.buildVersionEntries(document, versions));
    }
    return entries.sort((a, b) => b.version.version - a.version.version);
  });

  readonly displayedHistoryEntries = computed(() => {
    const filterId = this.historyDocumentFilterId();
    if (!filterId) {
      return this.historyEntries();
    }
    return this.historyEntries().filter((entry) => entry.documentId === filterId);
  });

  readonly historyFilterDocumentName = computed(() => {
    const filterId = this.historyDocumentFilterId();
    if (!filterId) {
      return '';
    }
    return this.visibleDocuments().find((document) => document.id === filterId)?.name ?? '';
  });

  readonly totalBytes = computed(() => this.visibleDocuments().reduce((sum, doc) => sum + (doc.sizeBytes || 0), 0));
  readonly compareDocument = computed(() => {
    const documentId = this.compareDocumentId();
    if (!documentId) {
      return null;
    }
    return this.visibleDocuments().find((document) => document.id === documentId) ?? null;
  });
  readonly compareVersions = computed(() => {
    const documentId = this.compareDocumentId();
    return documentId ? this.versionsByDocument()[documentId] ?? [] : [];
  });
  readonly permissionsDocument = computed(() => {
    const documentId = this.permissionsDocumentId();
    if (!documentId) {
      return null;
    }
    return this.visibleDocuments().find((document) => document.id === documentId) ?? null;
  });

  formatFileSize = formatFileSize;
  mimeTypeLabel = mimeTypeLabel;
  mimeTypeKind = mimeTypeKind;
  fileKindLabel = fileKindLabel;
  changeTypeLabel = changeTypeLabel;
  scopeLabel = scopeLabel;
  versionStatusLabel = versionStatusLabel;

  isEditableText(document: WorkflowDocument): boolean {
    return mimeTypeKind(document.mimeType) === 'text';
  }

  constructor() {
    effect(() => {
      const documents = this.visibleDocuments();
      const preview = this.previewDocument();
      if (!documents.length) {
        this.historyDocumentFilterId.set(null);
        this.previewDocument.set(null);
        return;
      }
      if (preview && !documents.some((document) => document.id === preview.id)) {
        this.previewDocument.set(null);
      }
    });

    effect(() => {
      this.documentRef.body.style.overflow = this.previewDocument() ? 'hidden' : '';
    });

    effect(() => {
      const document = this.previewDocument();
      const user = this.authService.getCurrentUser();
      if (!document || !user) {
        this.documentCollab.disconnect();
        return;
      }
      this.documentCollab.connectToDocument(document.id, user.id, user.email, user.full_name);
    });

    this.collabSubscription = this.documentCollab.onEvent().subscribe((event) => {
      if (!event.type.startsWith('document.') || event.type.startsWith('document.collab.')) {
        return;
      }
      const documentId = (event.payload['document_id'] as string) || this.previewDocument()?.id || '';
      if (documentId) {
        this.realtimeDocumentEvent.emit({ documentId, type: event.type });
      }
    });
  }

  ngOnDestroy(): void {
    this.documentRef.body.style.overflow = '';
    this.collabSubscription.unsubscribe();
    this.documentCollab.disconnect();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.previewDocument()) {
      this.closePreview();
    }
  }

  setSection(section: DocumentRepositorySection): void {
    this.repoSection.set(section);
    if (section === 'history') {
      this.historyDocumentFilterId.set(null);
      this.loadAllVersions.emit(this.visibleDocuments().map((doc) => doc.id));
    }
  }

  setTab(tab: DocumentRepositoryTab): void {
    this.activeTab.set(tab);
    this.showUploadPanel.set(false);
    if (this.repoSection() === 'history') {
      this.loadAllVersions.emit(this.visibleDocuments().map((doc) => doc.id));
    }
  }

  openPreviewModal(document: WorkflowDocument): void {
    this.previewDocument.set(document);
    this.loadComments.emit(document.id);
  }

  closePreview(): void {
    this.previewDocument.set(null);
    this.commentDraft.set('');
  }

  openFullPreview(): void {
    const document = this.previewDocument();
    if (document) {
      this.openPreview.emit(document);
    }
  }

  openEditorFromPreview(): void {
    const document = this.previewDocument();
    if (document) {
      this.openEditor.emit(document);
      this.closePreview();
    }
  }

  downloadPreviewDocument(): void {
    const document = this.previewDocument();
    if (!document) {
      return;
    }
    this.downloadDocument.emit({ documentId: document.id, name: document.fileName || document.name });
  }

  openPreviewFromHistory(entry: DocumentVersionHistoryEntry): void {
    const document = this.visibleDocuments().find((item) => item.id === entry.documentId);
    if (document) {
      this.openPreviewModal(document);
    }
  }

  openSpecificVersion(entry: DocumentVersionHistoryEntry): void {
    this.openVersion.emit({ documentId: entry.documentId, versionId: entry.version.id, fileName: entry.version.fileName });
  }

  requestSignature(entry: DocumentVersionHistoryEntry): void {
    this.signVersion.emit({ documentId: entry.documentId, versionId: entry.version.id });
  }

  requestValidation(entry: DocumentVersionHistoryEntry): void {
    this.validateVersion.emit({ documentId: entry.documentId, versionId: entry.version.id });
  }

  canCompareEntry(entry: DocumentVersionHistoryEntry): boolean {
    return (this.versionsByDocument()[entry.documentId] ?? []).length >= 2;
  }

  openCompare(entry: DocumentVersionHistoryEntry): void {
    this.compareDocumentId.set(entry.documentId);
    if (!(this.versionsByDocument()[entry.documentId] ?? []).length) {
      this.loadVersions.emit(entry.documentId);
    }
  }

  closeCompare(): void {
    this.compareDocumentId.set(null);
  }

  openPermissions(document: WorkflowDocument, event?: Event): void {
    event?.stopPropagation();
    this.permissionsDocumentId.set(document.id);
  }

  closePermissions(): void {
    this.permissionsDocumentId.set(null);
  }

  submitComment(): void {
    const document = this.previewDocument();
    const comment = this.commentDraft().trim();
    if (!document || !comment) {
      return;
    }
    this.addComment.emit({ documentId: document.id, comment });
    this.commentDraft.set('');
  }

  openHistoryForDocument(document: WorkflowDocument, event?: Event): void {
    event?.stopPropagation();
    this.repoSection.set('history');
    this.historyDocumentFilterId.set(document.id);
    this.loadVersions.emit(document.id);
  }

  clearHistoryFilter(): void {
    this.historyDocumentFilterId.set(null);
    this.loadAllVersions.emit(this.visibleDocuments().map((doc) => doc.id));
  }

  toggleUploadPanel(): void {
    this.showUploadPanel.update((value) => !value);
  }

  onPrimaryFileChange(event: Event): void {
    this.applySelectedFile((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.canWrite()) {
      this.dragOver.set(true);
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (!this.canWrite()) {
      return;
    }
    this.applySelectedFile(event.dataTransfer?.files?.[0] ?? null);
    this.showUploadPanel.set(true);
  }

  submitUpload(): void {
    const file = this.selectedFile();
    if (!file) {
      return;
    }
    this.uploadDocument.emit({
      name: this.documentName().trim() || file.name.replace(/\.[^.]+$/, ''),
      comment: this.documentComment().trim(),
      file,
      target: this.tramiteDocuments() ? this.activeTab() : 'actividad',
    });
    this.resetUploadForm();
  }

  onVersionFileChange(document: WorkflowDocument, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.versionFileByDocument.update((current) => ({ ...current, [document.id]: file }));
  }

  setVersionComment(documentId: string, comment: string): void {
    this.versionCommentByDocument.update((current) => ({ ...current, [documentId]: comment }));
  }

  submitVersion(document: WorkflowDocument, event?: Event): void {
    event?.stopPropagation();
    const file = this.versionFileByDocument()[document.id];
    if (!file) {
      return;
    }
    this.uploadVersion.emit({
      documentId: document.id,
      file,
      comment: this.versionCommentByDocument()[document.id]?.trim() ?? '',
      target: this.tramiteDocuments() ? this.activeTab() : 'actividad',
    });
    this.versionFileByDocument.update((current) => ({ ...current, [document.id]: null }));
    this.versionCommentByDocument.update((current) => ({ ...current, [document.id]: '' }));
  }

  private buildVersionEntries(document: WorkflowDocument | null | undefined, versions: WorkflowDocumentVersion[]): DocumentVersionHistoryEntry[] {
    if (!document) {
      return [];
    }
    if (!versions.length) {
      return [{
        documentId: document.id,
        documentName: document.name,
        documentScope: document.scope,
        currentVersion: document.version,
        version: {
          id: document.id,
          version: document.version,
          fileName: document.fileName,
          mimeType: document.mimeType,
          uploadedByName: document.uploadedByName,
          uploadedAtLabel: document.uploadedAtLabel,
          comment: document.comment,
          changeType: document.changeType,
          sizeBytes: document.sizeBytes,
        },
        status: 'Vigente',
      }];
    }
    return versions.map((version) => ({
      documentId: document.id,
      documentName: document.name,
      documentScope: document.scope,
      currentVersion: document.version,
      version,
      status: version.version === document.version ? 'Vigente' : 'Histórica',
    }));
  }

  private applySelectedFile(file: File | null): void {
    this.selectedFile.set(file);
    if (file && !this.documentName()) {
      this.documentName.set(file.name.replace(/\.[^.]+$/, ''));
    }
  }

  private resetUploadForm(): void {
    this.selectedFile.set(null);
    this.documentName.set('');
    this.documentComment.set('');
    this.showUploadPanel.set(false);
  }
}
