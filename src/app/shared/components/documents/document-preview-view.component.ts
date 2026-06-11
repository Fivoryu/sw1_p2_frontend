import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../../core/services/api.service';
import { formatFileSize, mimeTypeLabel, resolvePreviewMode, type PreviewMode } from '../../utils/file-format.utils';
import { looksLikeHtml } from '../../utils/rich-text.utils';

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

@Component({
  selector: 'app-document-preview-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-preview-view.component.html',
  styleUrl: './document-preview-view.component.scss',
})
export class DocumentPreviewViewComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private objectUrl: string | null = null;

  readonly documentId = input.required<string>();
  readonly fileName = input('');
  readonly mimeType = input('');
  readonly compact = input(false);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly mode = signal<PreviewMode>('iframe');
  readonly resourceUrl = signal<SafeResourceUrl | null>(null);
  readonly textContent = signal('');
  readonly richHtmlContent = signal<SafeHtml | null>(null);
  readonly textTruncated = signal(false);
  readonly resolvedMimeType = signal('');
  readonly resolvedFileName = signal('');
  readonly sizeBytes = signal(0);

  formatFileSize = formatFileSize;
  mimeTypeLabel = mimeTypeLabel;

  constructor() {
    effect(() => {
      const documentId = this.documentId();
      if (!documentId) {
        return;
      }
      this.load(documentId, this.fileName(), this.mimeType());
    });
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  load(documentId: string, fileName: string, mimeType: string): void {
    this.revokeObjectUrl();
    this.loading.set(true);
    this.error.set('');
    this.textContent.set('');
    this.richHtmlContent.set(null);
    this.textTruncated.set(false);
    this.resourceUrl.set(null);

    this.api.getBlobWithMeta(`/documents/${documentId}/content`).subscribe({
      next: async ({ blob, contentType }) => {
        const resolvedName = fileName || 'documento';
        const resolvedMime = mimeType || contentType || blob.type || 'application/octet-stream';
        const previewMode = resolvePreviewMode(resolvedMime, resolvedName);

        this.resolvedFileName.set(resolvedName);
        this.resolvedMimeType.set(resolvedMime);
        this.sizeBytes.set(blob.size);
        this.mode.set(previewMode);

        if (previewMode === 'text') {
          await this.loadTextPreview(blob);
          this.loading.set(false);
          return;
        }

        this.objectUrl = URL.createObjectURL(blob);
        this.resourceUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar la vista previa del documento.');
      },
    });
  }

  openInNewTab(): void {
    if (!this.objectUrl) {
      return;
    }
    window.open(this.objectUrl, '_blank', 'noopener');
  }

  getDownloadUrl(): string | null {
    return this.objectUrl;
  }

  private async loadTextPreview(blob: Blob): Promise<void> {
    const slice = blob.size > MAX_TEXT_PREVIEW_BYTES ? blob.slice(0, MAX_TEXT_PREVIEW_BYTES) : blob;
    this.textTruncated.set(blob.size > MAX_TEXT_PREVIEW_BYTES);
    const text = await slice.text();
    this.textContent.set(text);
    this.richHtmlContent.set(
      looksLikeHtml(text) ? this.sanitizer.bypassSecurityTrustHtml(text) : null,
    );
    this.objectUrl = URL.createObjectURL(blob);
    this.resourceUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
