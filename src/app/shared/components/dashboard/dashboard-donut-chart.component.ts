import { Component, computed, input } from '@angular/core';
import { DashboardChartPoint } from '../../../core/models/dashboard.models';

const CHART_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#64748b'];

@Component({
  selector: 'app-dashboard-donut-chart',
  standalone: true,
  template: `
    <div class="donut-chart">
      @if (!points().length) {
        <p class="donut-chart__empty">Sin datos para graficar.</p>
      } @else {
        <div class="donut-chart__layout">
          <div class="donut-chart__ring" [style.background]="gradient()">
            <div class="donut-chart__center">
              <strong>{{ total() }}</strong>
              <small>eventos</small>
            </div>
          </div>
          <ul class="donut-chart__legend">
            @for (slice of slices(); track slice.label) {
              <li>
                <span class="donut-chart__dot" [style.background]="slice.color"></span>
                <span class="donut-chart__name">{{ slice.label }}</span>
                <strong>{{ slice.value }}</strong>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    .donut-chart__empty {
      margin: 0;
      color: #64748b;
      font-size: 0.88rem;
    }

    .donut-chart__layout {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1rem;
      align-items: center;
    }

    .donut-chart__ring {
      width: 7.5rem;
      height: 7.5rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      position: relative;
    }

    .donut-chart__center {
      width: 4.6rem;
      height: 4.6rem;
      border-radius: 50%;
      background: #ffffff;
      display: grid;
      place-content: center;
      text-align: center;
      box-shadow: inset 0 0 0 1px #e2e8f0;
    }

    .donut-chart__center strong {
      font-size: 1.15rem;
      color: #0f172a;
      line-height: 1;
    }

    .donut-chart__center small {
      margin-top: 0.15rem;
      color: #64748b;
      font-size: 0.68rem;
    }

    .donut-chart__legend {
      display: grid;
      gap: 0.45rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .donut-chart__legend li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.45rem;
      align-items: center;
      font-size: 0.78rem;
      color: #475569;
    }

    .donut-chart__dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
    }

    .donut-chart__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 520px) {
      .donut-chart__layout {
        grid-template-columns: 1fr;
        justify-items: center;
      }
    }
  `,
})
export class DashboardDonutChartComponent {
  readonly points = input.required<DashboardChartPoint[]>();

  readonly total = computed(() => this.points().reduce((sum, point) => sum + point.value, 0));

  readonly slices = computed(() =>
    this.points().map((point, index) => ({
      label: point.label,
      value: point.value,
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
  );

  readonly gradient = computed(() => {
    const items = this.slices();
    const total = this.total() || 1;
    let cursor = 0;
    const segments = items.map((item) => {
      const start = cursor;
      const sweep = (item.value / total) * 100;
      cursor += sweep;
      return `${item.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });
}
