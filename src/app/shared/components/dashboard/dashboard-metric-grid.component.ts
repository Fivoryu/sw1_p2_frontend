import { Component, input } from '@angular/core';
import { DashboardMetric } from '../../../core/models/dashboard.models';
import { DashboardMetricCardComponent } from './dashboard-metric-card.component';

@Component({
  selector: 'app-dashboard-metric-grid',
  standalone: true,
  imports: [DashboardMetricCardComponent],
  template: `
    <div class="metric-grid">
      @for (metric of metrics(); track metric.key) {
        <app-dashboard-metric-card [metric]="metric" />
      }
    </div>
  `,
  styles: `
    .metric-grid {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  `,
})
export class DashboardMetricGridComponent {
  readonly metrics = input.required<DashboardMetric[]>();
}
