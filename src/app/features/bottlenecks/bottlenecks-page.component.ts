import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  BottleneckAnalysisApi,
  BottleneckFindingApi,
  BottleneckPolicyFindingApi,
} from '../../core/models/ai.models';
import { AiService } from '../../core/services/ai.service';
import { CustomSelectComponent, SelectOption } from '../../shared/ui/custom-select/custom-select.component';

@Component({
  selector: 'app-bottlenecks-page',
  standalone: true,
  imports: [CommonModule, CustomSelectComponent],
  templateUrl: './bottlenecks-page.component.html',
  styleUrl: './bottlenecks-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottlenecksPageComponent {
  private readonly aiService = inject(AiService);

  readonly analysis = signal<BottleneckAnalysisApi | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly severityFilter = signal('');

  readonly severityFilterOptions: SelectOption[] = [
    { value: '', label: 'Todas' },
    { value: 'critical', label: 'Crítica' },
    { value: 'high', label: 'Alta' },
    { value: 'medium', label: 'Media' },
    { value: 'low', label: 'Baja' },
  ];

  readonly visibleFindings = computed(() => {
    const severity = this.severityFilter();
    const findings = this.analysis()?.findings ?? [];
    return severity ? findings.filter((finding) => finding.severity === severity) : findings;
  });

  readonly visiblePolicyFindings = computed(() => {
    const severity = this.severityFilter();
    const findings = this.analysis()?.policy_findings ?? [];
    return severity ? findings.filter((finding) => finding.severity === severity) : findings;
  });

  readonly saturatedDepartments = computed(() =>
    (this.analysis()?.department_load ?? [])
      .filter((item) => item.pending_tasks > 0)
      .slice(0, 8),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.aiService.getBottlenecks().subscribe({
      next: (result) => {
        this.analysis.set(result);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo analizar cuellos de botella');
        this.loading.set(false);
      },
    });
  }

  metric(finding: BottleneckFindingApi, key: string): string {
    const value = finding.metrics?.[key];
    return value == null ? '-' : String(value);
  }

  policyMeta(finding: BottleneckPolicyFindingApi): string {
    const pieces = [`${finding.active_instances} trámites activos`, `${finding.departments_in_flow} departamentos`];
    if (finding.fork_imbalance > 0) {
      pieces.push(`desbalance +${finding.fork_imbalance}`);
    }
    return pieces.join(' · ');
  }

  severityLabel(severity: string): string {
    const labels: Record<string, string> = {
      critical: 'Crítica',
      high: 'Alta',
      medium: 'Media',
      low: 'Baja',
    };
    return labels[severity] ?? severity;
  }

  loadPercent(tasksPerStaff: number): number {
    return Math.min(100, Math.max(8, tasksPerStaff * 16));
  }
}
