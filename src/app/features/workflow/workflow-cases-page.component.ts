import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowCase } from '../../core/models/workflow.models';
import { WorkflowService } from '../../core/services/workflow.service';

@Component({
  selector: 'app-workflow-cases-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './workflow-cases-page.component.html',
  styleUrl: './workflow-cases-page.component.scss',
})
export class WorkflowCasesPageComponent {
  readonly workflowService = inject(WorkflowService);
  private readonly route = inject(ActivatedRoute);

  readonly statusFilter = signal<'all' | WorkflowCase['status']>('all');
  readonly searchTerm = signal('');
  readonly isFollowingCase = signal(false);
  readonly cases = this.workflowService.activeCases;
  readonly selectedCaseId = signal<string | null>(this.cases()[0]?.id ?? null);
  readonly selectedInstanceDetail = this.workflowService.selectedInstanceDetail;
  readonly kpis = this.workflowService.kpis;

  readonly filteredCases = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    return this.cases().filter((item) => {
      const matchesStatus = this.statusFilter() === 'all' || item.status === this.statusFilter();
      const matchesSearch =
        !search ||
        [item.processCode, item.policyName, item.currentStage, item.currentDepartment]
          .join(' ')
          .toLowerCase()
          .includes(search);
      return matchesStatus && matchesSearch;
    });
  });

  readonly selectedCase = computed(() => {
    const selectedId = this.selectedCaseId();
    if (selectedId) {
      const fromList = this.filteredCases().find((item) => item.id === selectedId);
      if (fromList) return fromList;
      const detail = this.selectedInstanceDetail();
      if (detail?.instance.id === selectedId) return detail.instance;
    }
    return this.filteredCases()[0] ?? null;
  });

  readonly progressTone = computed(() => {
    const progress = this.selectedCase()?.progress ?? 0;
    if (progress >= 70) return 'progress progress--high';
    if (progress >= 40) return 'progress progress--medium';
    return 'progress progress--low';
  });

  readonly routeStages = computed(() => {
    const detail = this.selectedInstanceDetail();
    if (!detail) {
      return [];
    }

    const completedNames = new Set(
      detail.tasks
        .filter((task) => task.status !== 'pendiente' && task.status !== 'nueva')
        .map((task) => task.taskName),
    );
    const activeName = detail.instance.currentStage;

    return detail.diagram.nodes
      .filter((node) => node.type === 'activity')
      .map((node, index) => {
        const lane = detail.diagram.lanes.find((item) => item.id === node.lane_id);
        const label = node.label || this.nodeTypeLabel(node.type);
        return {
          id: node.id,
          order: index + 1,
          label,
          departmentName: lane?.department_name ?? 'Sistema',
          state:
            activeName === label ? 'actual' : completedNames.has(node.label) ? 'completado' : 'pendiente',
        };
      });
  });

  readonly timelineTasks = computed(() => this.selectedInstanceDetail()?.tasks ?? []);
  readonly statusCards = computed(() => {
    const kpis = this.kpis();
    if (!kpis) {
      return [];
    }

    return [
      { label: 'Total', value: `${kpis.totalInstances}`, hint: 'trámites iniciados' },
      { label: 'Activos', value: `${kpis.activeInstances}`, hint: 'en curso ahora' },
      { label: 'Completados', value: `${kpis.completedInstances}`, hint: 'cerrados' },
    ];
  });

  constructor() {
    effect(() => {
      if (this.isFollowingCase()) return;
      const items = this.filteredCases();
      if (!items.length) {
        this.selectedCaseId.set(null);
        return;
      }
      if (!this.selectedCaseId() || !items.some((item) => item.id === this.selectedCaseId())) {
        this.selectedCaseId.set(items[0].id);
      }
    });

    effect(() => {
      if (this.isFollowingCase()) return;
      const item = this.selectedCase();
      if (!item) {
        return;
      }
      this.workflowService.loadInstanceDetail(item.id);
    });

    this.route.queryParamMap.subscribe((params) => {
      const openId = params.get('open');
      if (openId) {
        this.isFollowingCase.set(true);
        this.selectCase(openId);
        this.workflowService.loadInstanceDetail(openId);
      }
    });
  }

  selectCase(caseId: string): void {
    this.selectedCaseId.set(caseId);
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value as 'all' | WorkflowCase['status']);
    this.ensureValidSelection();
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.ensureValidSelection();
  }

  statusLabel(status: WorkflowCase['status']): string {
    return {
      activo: 'Activo',
      en_revision: 'En revisión',
      por_iniciar: 'Por iniciar',
    }[status];
  }

  stageStateLabel(state: string): string {
    return (
      {
        actual: 'En curso',
        completado: 'Completada',
        pendiente: 'Pendiente',
      }[state] ?? state
    );
  }

  taskStatusLabel(status: string): string {
    return {
      nueva: 'Nueva',
      pendiente: 'Pendiente',
      reclamada: 'Reclamada',
      en_progreso: 'En progreso',
    }[status] ?? status;
  }

  statusBadgeClass(status: WorkflowCase['status']): string {
    return `status-badge status-badge--${status}`;
  }

  taskStatusClass(status: string): string {
    return `task-status task-status--${status}`;
  }

  riskLabel(risk: string | undefined): string {
    return {
      alto: 'Riesgo alto',
      medio: 'Riesgo medio',
      bajo: 'Riesgo bajo',
    }[risk ?? 'bajo'] ?? 'Riesgo bajo';
  }

  riskBadgeClass(risk: string | undefined): string {
    return `status-badge status-badge--${risk ?? 'bajo'}`;
  }

  private ensureValidSelection(): void {
    const current = this.selectedCaseId();
    if (current && this.filteredCases().some((item) => item.id === current)) {
      return;
    }
    this.selectedCaseId.set(this.filteredCases()[0]?.id ?? null);
  }

  private nodeTypeLabel(type: string): string {
    return {
      initial: 'Inicio',
      activity: 'Actividad',
      decision: 'Decisión',
      fork: 'Fork',
      join: 'Join',
      final: 'Fin',
    }[type] ?? type;
  }
}
