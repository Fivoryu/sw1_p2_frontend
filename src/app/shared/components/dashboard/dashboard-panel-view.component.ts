import { Component, input } from '@angular/core';
import { DashboardPanel } from '../../../core/models/dashboard.models';
import { DashboardMetricGridComponent } from './dashboard-metric-grid.component';
import { DashboardSectionCardComponent } from './dashboard-section-card.component';

@Component({
  selector: 'app-dashboard-panel-view',
  standalone: true,
  imports: [DashboardMetricGridComponent, DashboardSectionCardComponent],
  template: `
    <section class="dashboard-panel">
      <header class="dashboard-hero panel">
        <div>
          <span class="eyebrow">Panel de Control</span>
          <h1>{{ panel().title }}</h1>
          <p>{{ panel().subtitle }}</p>
        </div>
        <span class="panel-type-badge">{{ panelTypeLabel() }}</span>
      </header>

      <app-dashboard-metric-grid [metrics]="panel().metrics" />

      <div class="dashboard-sections">
        @for (section of panel().sections; track section.key) {
          <app-dashboard-section-card [section]="section" />
        }
      </div>
    </section>
  `,
  styles: `
    .dashboard-panel {
      display: grid;
      gap: 1rem;
    }

    .dashboard-hero {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 42%),
        linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }

    .dashboard-hero h1 {
      margin: 0.25rem 0 0;
      font-size: clamp(1.6rem, 2vw, 2rem);
    }

    .dashboard-hero p {
      margin: 0.45rem 0 0;
      max-width: 44rem;
      color: #475569;
    }

    .panel-type-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 0.78rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .dashboard-sections {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    @media (max-width: 760px) {
      .dashboard-hero {
        flex-direction: column;
      }
    }
  `,
})
export class DashboardPanelViewComponent {
  readonly panel = input.required<DashboardPanel>();

  panelTypeLabel(): string {
    return {
      general: 'Vista general',
      area: 'Vista de área',
      worker: 'Vista personal',
      audit: 'Auditoría',
      tracking: 'Seguimiento',
    }[this.panel().panel_type];
  }
}
