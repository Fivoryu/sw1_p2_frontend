import { Component, computed, input } from '@angular/core';
import { DashboardChart, DashboardPanel, DashboardSection } from '../../../core/models/dashboard.models';
import { DashboardBarChartComponent } from './dashboard-bar-chart.component';
import { DashboardDonutChartComponent } from './dashboard-donut-chart.component';
import { DashboardMetricGridComponent } from './dashboard-metric-grid.component';

@Component({
  selector: 'app-audit-panel-view',
  standalone: true,
  imports: [DashboardMetricGridComponent, DashboardBarChartComponent, DashboardDonutChartComponent],
  templateUrl: './audit-panel-view.component.html',
  styleUrl: './audit-panel-view.component.scss',
})
export class AuditPanelViewComponent {
  readonly panel = input.required<DashboardPanel>();

  readonly charts = computed(() => this.panel().charts ?? []);

  readonly traceabilitySection = computed(() => this.sectionByKey('traceability'));
  readonly anomaliesSection = computed(() => this.sectionByKey('anomalies'));
  readonly coverageSection = computed(() => this.sectionByKey('coverage'));
  readonly flowSection = computed(() => this.sectionByKey('flow_tracking'));

  chartByKey(key: string): DashboardChart | undefined {
    return this.charts().find((chart) => chart.key === key);
  }

  toneClass(tone?: string): string {
    return tone && tone !== 'default' ? `audit-list__item--${tone}` : '';
  }

  timelineToneClass(tone?: string): string {
    return tone && tone !== 'default' ? `audit-timeline__item--${tone}` : '';
  }

  private sectionByKey(key: string): DashboardSection | undefined {
    return this.panel().sections.find((section) => section.key === key);
  }
}
