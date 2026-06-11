import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkflowService } from '../../core/services/workflow.service';
import { WorkflowCase } from '../../core/models/workflow.models';

@Component({
  selector: 'app-workflow-following-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="following-page">
      <header class="panel">
        <div>
          <span class="eyebrow">Seguimiento</span>
          <h1>Trámites en los que participo</h1>
          <p>Historial de trámites donde reclamaste o completaste tareas.</p>
        </div>
        <div class="actions">
          <select [(ngModel)]="statusFilter" (ngModelChange)="refresh()">
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="completed">Completados</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <button type="button" (click)="refresh()" [disabled]="loading()">
            {{ loading() ? 'Cargando...' : 'Actualizar' }}
          </button>
        </div>
      </header>

      <div class="error" *ngIf="error()">{{ error() }}</div>

      <div class="empty-state" *ngIf="!loading() && !error() && instances().length === 0">
        <strong>Sin seguimientos</strong>
        <p>Aún no has participado en ningún trámite. Reclama una tarea desde la bandeja para empezar.</p>
      </div>

      <div class="table-wrapper" *ngIf="instances().length">
        <table>
          <thead>
            <tr>
              <th>Caso</th>
              <th>Política</th>
              <th>Estado</th>
              <th>Progreso</th>
              <th>Departamento actual</th>
              <th>Tarea actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of instances()">
              <td><strong>{{ item.processCode }}</strong></td>
              <td>{{ item.policyName }}</td>
              <td><span [class]="statusBadge(item.status)">{{ item.status }}</span></td>
              <td>
                <div class="progress-bar">
                  <div class="progress-fill" [style.width.%]="item.progress"></div>
                </div>
                <small>{{ item.progress }}%</small>
              </td>
              <td>{{ item.currentDepartment || '-' }}</td>
              <td>{{ item.currentStage || '-' }}</td>
              <td>
                <a [routerLink]="['/workflow/tramites']" [queryParams]="{open: item.id}">Ver detalle</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .following-page { display: grid; gap: 1rem; }
    .panel { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
    .actions { display: flex; gap: 0.5rem; align-items: center; }
    select { padding: 0.6rem 0.8rem; border-radius: 0.6rem; border: 1px solid #cbd5e1; background: #f8fafc; }
    button {
      padding: 0.6rem 1rem; border: 0; border-radius: 0.6rem;
      background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 600;
    }
    .error { padding: 0.75rem 1rem; background: #fee2e2; color: #b91c1c; border-radius: 0.6rem; }
    .badge { display: inline-flex; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700; text-transform: lowercase; }
    .badge--active { background: #dcfce7; color: #166534; }
    .badge--completed { background: #dbeafe; color: #1e40af; }
    .badge--blocked { background: #fee2e2; color: #b91c1c; }
    .badge--pending { background: #fef3c7; color: #92400e; }
    .progress-bar { width: 6rem; height: 0.5rem; background: #e2e8f0; border-radius: 999px; overflow: hidden; display: inline-block; margin-right: 0.5rem; vertical-align: middle; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); border-radius: 999px; transition: width 0.3s; }
    small { font-size: 0.75rem; color: #64748b; }
    .empty-state { padding: 2rem; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 1rem; }
  `],
})
export class WorkflowFollowingPageComponent {
  private readonly workflowService = inject(WorkflowService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly statusFilter = signal('');
  readonly instances = signal<WorkflowCase[]>([]);

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set('');
    this.workflowService.getFollowedInstances(this.statusFilter() || undefined).subscribe({
      next: (cases) => {
        this.instances.set(cases);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Error al cargar seguimientos');
        this.loading.set(false);
      },
    });
  }

  statusBadge(status: string): string {
    const map: Record<string, string> = {
      active: 'badge badge--active',
      completed: 'badge badge--completed',
      blocked: 'badge badge--blocked',
      pending: 'badge badge--pending',
    };
    return map[status] ?? 'badge badge--pending';
  }
}
