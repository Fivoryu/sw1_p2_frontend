import { Component, input } from '@angular/core';
import { DashboardMetric, DashboardTone } from '../../../core/models/dashboard.models';

@Component({
  selector: 'app-dashboard-metric-card',
  standalone: true,
  template: `
    <article class="metric-card" [class]="toneClass()">
      <span class="metric-accent" aria-hidden="true"></span>
      <div class="metric-body">
        <span class="metric-label">{{ metric().label }}</span>
        <strong class="metric-value">{{ metric().value }}</strong>
        @if (metric().hint) {
          <small class="metric-hint">{{ metric().hint }}</small>
        }
      </div>
    </article>
  `,
  styles: `
    .metric-card {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      align-items: stretch;
      padding: 0.95rem 1rem;
      border-radius: 1rem;
      border: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #ffffff, #f8fafc);
      min-height: 100%;
      overflow: hidden;
    }

    .metric-accent {
      width: 0.28rem;
      border-radius: 999px;
      background: #cbd5e1;
    }

    .metric-body {
      display: grid;
      gap: 0.2rem;
    }

    .metric-label {
      font-size: 0.82rem;
      color: #64748b;
    }

    .metric-value {
      font-size: clamp(1.35rem, 2vw, 1.75rem);
      line-height: 1.1;
      color: #0f172a;
    }

    .metric-hint {
      color: #94a3b8;
      font-size: 0.78rem;
    }

    .metric-card--info {
      border-color: #bfdbfe;
      background: linear-gradient(180deg, #ffffff, #eff6ff);
    }

    .metric-card--info .metric-accent {
      background: #2563eb;
    }

    .metric-card--success {
      border-color: #86efac;
      background: linear-gradient(180deg, #ffffff, #f0fdf4);
    }

    .metric-card--success .metric-accent {
      background: #16a34a;
    }

    .metric-card--warning {
      border-color: #fcd34d;
      background: linear-gradient(180deg, #ffffff, #fffbeb);
    }

    .metric-card--warning .metric-accent {
      background: #d97706;
    }

    .metric-card--danger {
      border-color: #fca5a5;
      background: linear-gradient(180deg, #ffffff, #fef2f2);
    }

    .metric-card--danger .metric-accent {
      background: #dc2626;
    }
  `,
})
export class DashboardMetricCardComponent {
  readonly metric = input.required<DashboardMetric>();

  toneClass(): string {
    const tone = this.metric().tone ?? 'default';
    return tone === 'default' ? '' : `metric-card--${tone}`;
  }
}
