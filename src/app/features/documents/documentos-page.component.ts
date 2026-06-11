import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { FileKind, fileKindLabel, mimeTypeKind, mimeTypeLabel } from '../../shared/utils/file-format.utils';

interface DocumentEntry {
  id: string;
  case_id: string;
  case_code: string | null;
  name: string;
  scope: string;
  category: string;
  current_version: number;
  created_by_name: string;
  created_at: string;
  file_name: string;
  mime_type: string;
  change_type: string;
  uploaded_by_name: string;
  uploaded_at: string | null;
  instance_status: string | null;
  requester_name: string | null;
  requester_email: string | null;
  policy_name: string | null;
  department_name: string | null;
  subject: string | null;
}

@Component({
  selector: 'app-documentos-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documentos-page.component.html',
  styleUrl: './documentos-page.component.scss',
})
export class DocumentosPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly q = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly statusFilter = signal('');
  readonly categoryFilter = signal('');
  readonly scopeFilter = signal('');
  readonly mimeFilter = signal('');
  readonly documents = signal<DocumentEntry[]>([]);
  readonly loading = signal(false);

  readonly canSign = computed(() => this.authService.canSignDocuments());

  readonly hasActiveFilters = computed(() =>
    !!(
      this.q() ||
      this.dateFrom() ||
      this.dateTo() ||
      this.statusFilter() ||
      this.categoryFilter() ||
      this.scopeFilter() ||
      this.mimeFilter()
    ),
  );

  readonly activeTramiteCount = computed(
    () => this.documents().filter((doc) => doc.instance_status === 'active').length,
  );

  readonly distinctTypeCount = computed(() => {
    const kinds = new Set(this.documents().map((doc) => this.fileKind(doc)));
    return kinds.size;
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadDocuments();
  }

  reload(): void {
    this.loadDocuments();
  }

  onSearch(value: string): void {
    this.q.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.loadDocuments(), 300);
  }

  loadDocuments(): void {
    const params: string[] = [];
    if (this.q()) params.push(`q=${encodeURIComponent(this.q())}`);
    if (this.dateFrom()) params.push(`date_from=${this.dateFrom()}`);
    if (this.dateTo()) params.push(`date_to=${this.dateTo()}`);
    if (this.statusFilter()) params.push(`status=${this.statusFilter()}`);
    if (this.categoryFilter()) params.push(`category=${encodeURIComponent(this.categoryFilter())}`);
    if (this.scopeFilter()) params.push(`scope=${this.scopeFilter()}`);
    if (this.mimeFilter()) params.push(`mime_type=${this.mimeFilter()}`);
    const qs = params.length ? `?${params.join('&')}` : '';

    this.loading.set(true);
    this.api.get<DocumentEntry[]>(`/documents${qs}`).subscribe({
      next: (res) => {
        this.documents.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.documents.set([]);
        this.loading.set(false);
      },
    });
  }

  clearFilters(): void {
    this.q.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.statusFilter.set('');
    this.categoryFilter.set('');
    this.scopeFilter.set('');
    this.mimeFilter.set('');
    this.loadDocuments();
  }

  openDocument(doc: DocumentEntry): void {
    const isPanel = this.router.url.startsWith('/panel');
    const base = isPanel ? '/panel/documentos' : '/workflow/documentos';
    this.router.navigate([base, doc.id, 'vista'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  openEditor(doc: DocumentEntry): void {
    const isPanel = this.router.url.startsWith('/panel');
    const base = isPanel ? '/panel/documentos' : '/workflow/documentos';
    this.router.navigate([base, doc.id, 'editar'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  signDocument(doc: DocumentEntry): void {
    if (!confirm(`¿Firmar "${doc.name}" v${doc.current_version}?`)) {
      return;
    }
    const formData = new FormData();
    formData.append('reason', 'Firma desde vista global');
    this.api.post<unknown>(`/documents/${doc.id}/versions/latest/sign`, formData).subscribe({
      next: () => {
        alert('Documento firmado correctamente.');
        this.loadDocuments();
      },
      error: (err) => alert('Error al firmar: ' + (err.error?.detail || 'Error desconocido')),
    });
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  fileKind(doc: DocumentEntry): FileKind {
    return mimeTypeKind(doc.mime_type || '');
  }

  fileTypeLabel(doc: DocumentEntry): string {
    const fromMime = mimeTypeLabel(doc.mime_type || '');
    if (fromMime !== 'Archivo' && fromMime !== doc.mime_type) {
      return fileKindLabel(this.fileKind(doc));
    }
    return this.fileExt(doc.file_name);
  }

  fileExt(fileName: string): string {
    if (!fileName) return '—';
    return fileName.split('.').pop()?.toUpperCase() || '—';
  }

  statusClass(status: string | null): string {
    if (!status) return 'documentos-badge--pending';
    const map: Record<string, string> = {
      active: 'documentos-badge--active',
      completed: 'documentos-badge--completed',
      blocked: 'documentos-badge--blocked',
    };
    return map[status] || 'documentos-badge--pending';
  }

  statusLabel(status: string | null): string {
    if (!status) return '—';
    const map: Record<string, string> = {
      active: 'Activo',
      completed: 'Completado',
      blocked: 'Bloqueado',
    };
    return map[status] || status;
  }
}
