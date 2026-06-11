import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { defaultKeymap } from '@codemirror/commands';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { AuthService } from '../../core/services/auth.service';
import { DocumentCollabService, DocumentPresenceUser } from '../../core/services/document-collab.service';
import { WorkflowDocumentVersionApi } from '../../core/models/workflow.models';
import { RichTextEditorComponent } from '../../shared/components/documents/rich-text-editor.component';
import { changeTypeLabel, formatFileSize, mimeTypeLabel } from '../../shared/utils/file-format.utils';

const AUTO_SAVE_DELAY_MS = 3000;

@Component({
  selector: 'app-workflow-document-editor-page',
  standalone: true,
  imports: [CommonModule, RichTextEditorComponent],
  templateUrl: './workflow-document-editor-page.component.html',
  styleUrl: './workflow-document-editor-page.component.scss',
})
export class WorkflowDocumentEditorPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: false }) editorContainer?: ElementRef<HTMLDivElement>;
  @ViewChild(RichTextEditorComponent) richTextEditor?: RichTextEditorComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);
  readonly collabService = inject(DocumentCollabService);

  private editorView: EditorView | null = null;
  private pendingContent = '';
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isEditingActive = false;
  private editorInitScheduled = false;

  readonly documentId = toSignal(this.route.paramMap.pipe(map((params) => params.get('documentId') ?? '')), {
    initialValue: '',
  });

  readonly returnUrl = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('returnUrl') ?? '')), {
    initialValue: '',
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saveStatus = signal<'idle' | 'saved' | 'error' | 'conflict'>('idle');
  readonly errorMessage = signal('');
  readonly notEditable = signal(false);
  readonly content = signal('');
  readonly initialContent = signal('');
  readonly baseVersion = signal<number | null>(null);
  readonly fileName = signal('');
  readonly mimeType = signal('');
  readonly versionNumber = signal(0);
  readonly presenceUsers = signal<DocumentPresenceUser[]>([]);

  readonly versions = signal<WorkflowDocumentVersionApi[]>([]);
  readonly showHistory = signal(false);
  readonly loadingVersions = signal(false);

  readonly hasChanges = computed(() => this.content() !== this.initialContent());
  readonly isClean = computed(() => !this.hasChanges());
  readonly saveStatusLabel = computed(() => {
    switch (this.saveStatus()) {
      case 'saved':
        return 'Guardado';
      case 'error':
        return 'Error al guardar';
      case 'conflict':
        return 'Conflicto: alguien más editó';
      default:
        return this.saving() ? 'Guardando...' : this.hasChanges() ? 'Cambios sin guardar' : 'Sin cambios';
    }
  });

  readonly editorLanguage = computed(() => {
    const mime = this.mimeType();
    const name = this.fileName();
    if (mime.includes('markdown') || name.endsWith('.md')) return 'markdown';
    if (mime.includes('json') || name.endsWith('.json')) return 'json';
    if (mime.includes('css') || name.endsWith('.css')) return 'css';
    return 'text';
  });

  readonly isRichTextMode = computed(() => this.editorLanguage() === 'text');

  readonly editorModeLabel = computed(() => {
    if (this.isRichTextMode()) {
      return 'Documento';
    }
    return this.editorLanguage();
  });

  readonly editingUserNames = computed(() => {
    const users = this.collabService.editingUsers();
    return users.map((u) => u.user_name).join(', ');
  });

  changeTypeLabel = changeTypeLabel;
  formatFileSize = formatFileSize;
  mimeTypeLabel = mimeTypeLabel;

  constructor() {
    effect(() => {
      const documentId = this.documentId();
      if (!documentId) return;
      this.loadSnapshot(documentId);
    });

    effect(() => {
      const event = this.collabService.lastEvent();
      if (!event) return;
      if (event.type === 'document.edit.saved') {
        const savedVersion = event.payload['version_number'] as number | undefined;
        if (!savedVersion || savedVersion <= (this.baseVersion() ?? 0)) {
          return;
        }
        this.versionNumber.set(savedVersion);
        if (this.hasChanges()) {
          this.saveStatus.set('conflict');
          this.errorMessage.set('Otro usuario guardó cambios. Recargá para obtener la versión más reciente.');
          return;
        }
        this.baseVersion.set(savedVersion);
        this.initialContent.set(this.content());
        this.saveStatus.set('saved');
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isRichTextMode()) {
      this.scheduleEditorInit();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!this.saving() && this.hasChanges()) {
        this.save();
      }
    }
  }

  onRichTextChange(html: string): void {
    this.content.set(html);
    if (this.saveStatus() !== 'idle' && this.saveStatus() !== 'conflict') {
      this.saveStatus.set('idle');
    }
    this.scheduleAutoSave();
  }

  ngOnDestroy(): void {
    this.clearAutoSave();
    this.sendIdleIfActive();
    this.destroyEditor();
    this.collabService.disconnect();
  }

  loadSnapshot(documentId: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.notEditable.set(false);
    this.saveStatus.set('idle');
    this.destroyEditor();
    this.collabService.getSnapshot(documentId).subscribe({
      next: (snapshot) => {
        if (!snapshot.editable) {
          this.notEditable.set(true);
          this.loading.set(false);
          this.fileName.set(`Documento #${documentId.slice(0, 8)}`);
          this.mimeType.set(snapshot.mime_type);
          return;
        }
        this.content.set(snapshot.content);
        this.initialContent.set(snapshot.content);
        this.baseVersion.set(snapshot.version_number);
        this.versionNumber.set(snapshot.version_number);
        this.mimeType.set(snapshot.mime_type);
        this.fileName.set(snapshot.document_id);
        this.presenceUsers.set(snapshot.connected_users);
        this.pendingContent = snapshot.content;
        this.loading.set(false);
        this.scheduleEditorInit();
        this.connectWebSocket(documentId);
      },
      error: () => {
        this.errorMessage.set('No se pudo cargar el documento.');
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const documentId = this.documentId();
    if (!documentId || this.saving()) return;

    const content = this.isRichTextMode()
      ? (this.richTextEditor?.getHtml() ?? this.content())
      : this.editorView
        ? this.editorView.state.doc.toString()
        : this.content();
    this.content.set(content);
    this.clearAutoSave();

    this.saving.set(true);
    this.saveStatus.set('idle');

    this.collabService.saveContent(documentId, content, this.baseVersion(), 'Edición colaborativa').subscribe({
      next: (doc) => {
        const newVersion = doc.current_version;
        this.baseVersion.set(newVersion);
        this.versionNumber.set(newVersion);
        this.initialContent.set(content);
        this.errorMessage.set('');
        this.saving.set(false);
        this.saveStatus.set('saved');
        setTimeout(() => {
          if (this.saveStatus() === 'saved') {
            this.saveStatus.set('idle');
          }
        }, 3000);
      },
      error: (error) => {
        this.saving.set(false);
        if (error?.status === 409) {
          this.saveStatus.set('conflict');
          this.errorMessage.set('Otro usuario guardó cambios. Recargá para obtener la versión más reciente.');
        } else {
          this.saveStatus.set('error');
          this.errorMessage.set(error?.error?.detail ?? 'No se pudo guardar.');
        }
      },
    });
  }

  scheduleAutoSave(): void {
    this.clearAutoSave();
    if (!this.hasChanges() || this.saving()) return;
    this.sendEditingIfIdle();
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      if (this.hasChanges() && !this.saving()) {
        this.save();
        setTimeout(() => this.sendIdleIfActive(), 500);
      }
    }, AUTO_SAVE_DELAY_MS);
  }

  toggleHistory(): void {
    const show = !this.showHistory();
    this.showHistory.set(show);
    if (show && !this.versions().length) {
      this.loadVersions();
    }
  }

  loadVersions(): void {
    const documentId = this.documentId();
    if (!documentId) return;
    this.loadingVersions.set(true);
    this.collabService.getVersions(documentId).subscribe({
      next: (payload) => {
        this.versions.set(payload.versions);
        this.loadingVersions.set(false);
      },
      error: () => {
        this.loadingVersions.set(false);
      },
    });
  }

  revertToVersion(version: WorkflowDocumentVersionApi): void {
    const documentId = this.documentId();
    if (!documentId) return;
    this.collabService.getVersionContent(documentId, version.id).subscribe({
      next: (blob) => {
        blob.text().then((text) => {
          this.content.set(text);
          this.initialContent.set(text);
          this.pendingContent = text;
          this.saveStatus.set('idle');
          this.errorMessage.set('');
          this.updateEditorContent(text);
          this.showHistory.set(false);
        });
      },
    });
  }

  reloadContent(): void {
    const documentId = this.documentId();
    if (documentId) {
      this.loadSnapshot(documentId);
    }
  }

  goBack(): void {
    const fallback = `/workflow/documentos/${this.documentId()}/vista`;
    void this.router.navigateByUrl(this.returnUrl() || fallback);
  }

  private scheduleEditorInit(): void {
    if (this.editorInitScheduled || this.loading() || this.notEditable() || this.isRichTextMode()) {
      return;
    }
    this.editorInitScheduled = true;
    afterNextRender(
      () => {
        this.editorInitScheduled = false;
        this.initEditor();
      },
      { injector: this.injector },
    );
  }

  private initEditor(): void {
    if (!this.editorContainer?.nativeElement || this.loading() || this.notEditable()) {
      return;
    }

    const content = this.pendingContent || this.content();
    if (this.editorView && this.editorView.state.doc.toString() === content) {
      return;
    }

    this.destroyEditor();

    const language = this.editorLanguage();
    const saveBinding = () => {
      this.save();
      return true;
    };

    const extensions = [
      basicSetup,
      oneDark,
      keymap.of([
        ...defaultKeymap,
        { key: 'Mod-s', preventDefault: true, run: saveBinding },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          this.content.set(newContent);
          if (this.saveStatus() !== 'idle' && this.saveStatus() !== 'conflict') {
            this.saveStatus.set('idle');
          }
          this.scheduleAutoSave();
        }
      }),
      cmPlaceholder('Escribí el contenido del documento aquí...'),
      EditorView.theme({
        '&': { height: '100%', minHeight: '60vh' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace" },
      }),
    ];

    if (language === 'markdown') {
      extensions.push(markdown());
    } else if (language === 'json') {
      extensions.push(json());
    } else if (language === 'css') {
      extensions.push(css());
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    this.editorView = new EditorView({
      state,
      parent: this.editorContainer.nativeElement,
    });
    this.pendingContent = '';
  }

  private updateEditorContent(text: string): void {
    if (this.isRichTextMode()) {
      this.richTextEditor?.setHtml(text);
      return;
    }
    if (this.editorView) {
      const current = this.editorView.state.doc.toString();
      if (current !== text) {
        this.editorView.dispatch({
          changes: { from: 0, to: this.editorView.state.doc.length, insert: text },
        });
      }
      return;
    }
    this.scheduleEditorInit();
  }

  private destroyEditor(): void {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
  }

  private clearAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private sendEditingIfIdle(): void {
    if (!this.isEditingActive) {
      this.isEditingActive = true;
      this.collabService.sendEditing();
    }
  }

  private sendIdleIfActive(): void {
    if (this.isEditingActive) {
      this.isEditingActive = false;
      this.collabService.sendIdle();
    }
  }

  private connectWebSocket(documentId: string): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    this.collabService.connectToDocument(documentId, user.id, user.email, user.full_name);
  }
}
