import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuditLogItemApi, AuditLogListApi } from '../../core/models/audit.models';

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-page.component.html',
  styleUrls: ['./audit-page.component.scss'],
})
export class AuditPageComponent {
  private readonly api = inject(ApiService);

  readonly userEmail = signal('');
  readonly action = signal('');
  readonly resource = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly items = signal<AuditLogListApi['items']>([]);
  readonly total = signal(0);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50] as const;
  readonly detailsModalItem = signal<AuditLogItemApi | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly pageRangeLabel = computed(() => {
    const total = this.total();
    if (!total) {
      return '0 eventos';
    }
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `Mostrando ${start}-${end} de ${total} eventos`;
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    const end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly hasActiveFilters = computed(
    () =>
      !!this.userEmail().trim() ||
      !!this.action().trim() ||
      !!this.resource().trim() ||
      !!this.fromDate() ||
      !!this.toDate(),
  );

  constructor() {
    this.load();
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.load();
  }

  load(): void {
    const params = new URLSearchParams();
    const email = this.userEmail().trim();
    const action = this.action().trim();
    const resource = this.resource().trim();
    if (email) params.set('user_email', email);
    if (action) params.set('action', action);
    if (resource) params.set('resource', resource);
    if (this.fromDate()) params.set('from_date', `${this.fromDate()}T00:00:00`);
    if (this.toDate()) params.set('to_date', `${this.toDate()}T23:59:59`);
    params.set('skip', String((this.currentPage() - 1) * this.pageSize()));
    params.set('limit', String(this.pageSize()));
    this.loading.set(true);
    this.api.get<AuditLogListApi>(`/audit/?${params.toString()}`).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.total.set(result.total);
        const maxPage = Math.max(1, Math.ceil(result.total / this.pageSize()));
        if (this.currentPage() > maxPage) {
          this.currentPage.set(maxPage);
          this.load();
          return;
        }
        this.error.set('');
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo cargar la auditoría');
        this.loading.set(false);
      },
    });
  }

  clearFilters(): void {
    this.userEmail.set('');
    this.action.set('');
    this.resource.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.currentPage.set(1);
    this.load();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.load();
  }

  goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.currentPage()) {
      return;
    }
    this.currentPage.set(next);
    this.load();
  }

  previousPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  openDetails(item: AuditLogItemApi): void {
    this.detailsModalItem.set(item);
  }

  closeDetails(): void {
    this.detailsModalItem.set(null);
  }

  badgeLabel(value: string): string {
    return value.replaceAll('_', ' ');
  }

  stringifyDetails(details: Record<string, unknown>): string {
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
