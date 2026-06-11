import { Component, computed, input } from '@angular/core';
import { DashboardChartPoint } from '../../../core/models/dashboard.models';

const CHART_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#64748b'];

@Component({
  selector: 'app-dashboard-bar-chart',
  standalone: true,
  template: `
    <div class="bar-chart">
      @if (!points().length) {
        <p class="bar-chart__empty">Sin datos para graficar.</p>
      } @else {
        @for (point of normalizedPoints(); track point.label) {
          <div class="bar-chart__row">
            <span class="bar-chart__label" [title]="point.label">{{ point.label }}</span>
            <div class="bar-chart__track">
              <div class="bar-chart__fill" [style.width.%]="point.percent" [style.background]="point.color"></div>
            </div>
            <span class="bar-chart__value">{{ point.value }}</span>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .bar-chart {
      display: grid;
      gap: 0.75rem;
    }

    .bar-chart__empty {
      margin: 0;
      color: #64748b;
      font-size: 0.88rem;
    }

    .bar-chart__row {
      display: grid;
      grid-template-columns: minmax(5.5rem, 7.5rem) 1fr auto;
      gap: 0.65rem;
      align-items: center;
    }

    .bar-chart__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.78rem;
      color: #475569;
      font-weight: 600;
    }

    .bar-chart__track {
      height: 0.65rem;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }

    .bar-chart__fill {
      height: 100%;
      border-radius: inherit;
      min-width: 0.25rem;
      transition: width 0.35s ease;
    }

    .bar-chart__value {
      min-width: 1.75rem;
      font-size: 0.78rem;
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }
  `,
})
export class DashboardBarChartComponent {
  readonly points = input.required<DashboardChartPoint[]>();

  readonly normalizedPoints = computed(() => {
    const items = this.points();
    const max = Math.max(...items.map((item) => item.value), 1);
    return items.map((item, index) => ({
      label: item.label,
      value: item.value,
      percent: Math.max(6, Math.round((item.value / max) * 100)),
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  });
}
