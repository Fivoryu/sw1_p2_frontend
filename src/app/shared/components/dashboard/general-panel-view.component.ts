import { Component, computed, input } from '@angular/core';
import { DashboardChart, DashboardPanel, DashboardSection } from '../../../core/models/dashboard.models';
import { DashboardBarChartComponent } from './dashboard-bar-chart.component';
import { DashboardDonutChartComponent } from './dashboard-donut-chart.component';
import { DashboardMetricGridComponent } from './dashboard-metric-grid.component';

@Component({
  selector: 'app-general-panel-view',
  standalone: true,
  imports: [DashboardMetricGridComponent, DashboardBarChartComponent, DashboardDonutChartComponent],
  templateUrl: './general-panel-view.component.html',
  styleUrl: './general-panel-view.component.scss',
})
export class GeneralPanelViewComponent {
  readonly panel = input.required<DashboardPanel>();

  readonly charts = computed(() => this.panel().charts ?? []);

  readonly workloadSection = computed(() => this.sectionByKey('by_worker'));
  readonly reviewSection = computed(() => this.sectionByKey('review_pending'));
  readonly anomaliesSection = computed(() => this.sectionByKey('ai_anomalies'));

  chartByKey(key: string): DashboardChart | undefined {
    return this.charts().find((chart) => chart.key === key);
  }

  toneClass(tone?: string): string {
    return tone && tone !== 'default' ? `general-list__item--${tone}` : '';
  }

  private sectionByKey(key: string): DashboardSection | undefined {
    return this.panel().sections.find((section) => section.key === key);
  }
}
