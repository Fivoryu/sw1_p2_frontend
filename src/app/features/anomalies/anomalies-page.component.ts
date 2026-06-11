import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnomalyAlertApi } from '../../core/models/ai.models';
import { AiService } from '../../core/services/ai.service';

@Component({
  selector: 'app-anomalies-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './anomalies-page.component.html',
  styleUrl: './anomalies-page.component.scss',
})
export class AnomaliesPageComponent {
  private readonly aiService = inject(AiService);

  readonly alerts = signal<AnomalyAlertApi[]>([]);
  readonly total = signal(0);
  readonly openCount = signal(0);
  readonly loading = signal(false);
  readonly running = signal(false);
  readonly error = signal('');
  readonly statusFilter = signal('open');
  readonly severityFilter = signal('');
  readonly entityTypeFilter = signal('');
  readonly notesDraft = signal('');
  readonly acknowledgingId = signal<string | null>(null);

  readonly severityCounts = computed(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    this.alerts().forEach((alert) => counts[alert.severity] = (counts[alert.severity] ?? 0) + 1);
    return counts;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.aiService.getAnomalies({
      status: this.statusFilter(),
      severity: this.severityFilter(),
      entity_type: this.entityTypeFilter(),
    }).subscribe({
      next: (result) => {
        this.alerts.set(result.alerts);
        this.total.set(result.total);
        this.openCount.set(result.open_count);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar las anomalías');
        this.loading.set(false);
      },
    });
  }

  runDetection(): void {
    this.running.set(true);
    this.aiService.runAnomalyDetection().subscribe({
      next: () => {
        this.running.set(false);
        this.load();
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo ejecutar la detección');
        this.running.set(false);
      },
    });
  }

  startAcknowledge(alertId: string): void {
    this.acknowledgingId.set(alertId);
    this.notesDraft.set('');
  }

  acknowledge(alertId: string): void {
    this.aiService.acknowledgeAnomaly(alertId, this.notesDraft()).subscribe({ next: () => { this.acknowledgingId.set(null); this.load(); } });
  }

  dismiss(alertId: string): void {
    this.aiService.dismissAnomaly(alertId).subscribe({ next: () => this.load() });
  }

  metric(alert: AnomalyAlertApi, key: string): string {
    const value = alert.metrics?.[key];
    return value == null ? '-' : String(value);
  }
}
