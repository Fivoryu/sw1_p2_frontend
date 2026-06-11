import { Injectable, inject, signal } from '@angular/core';
import { DashboardPanel } from '../models/dashboard.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly panel = signal<DashboardPanel | null>(null);

  loadPanel(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<DashboardPanel>('/dashboard/panel').subscribe({
      next: (panel) => {
        this.panel.set(panel);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.detail ?? 'No se pudo cargar el panel de control');
      },
    });
  }

  loadAuditPanel(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<DashboardPanel>('/dashboard/audit-panel').subscribe({
      next: (panel) => {
        this.panel.set(panel);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.detail ?? 'No se pudo cargar el panel de auditoría');
      },
    });
  }

  clear(): void {
    this.panel.set(null);
    this.error.set('');
  }
}
