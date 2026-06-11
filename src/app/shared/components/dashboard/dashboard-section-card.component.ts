import { Component, input } from '@angular/core';
import { DashboardListItem, DashboardSection } from '../../../core/models/dashboard.models';

@Component({
  selector: 'app-dashboard-section-card',
  standalone: true,
  template: `
    <section class="section-card panel">
      <header class="section-head">
        <div>
          <h3>{{ section().title }}</h3>
          @if (section().description) {
            <p class="muted">{{ section().description }}</p>
          }
        </div>
      </header>

      <div class="section-list">
        @for (item of section().items; track item.title + (item.subtitle ?? '') + (item.value ?? '')) {
          <article class="section-item" [class]="toneClass(item.tone)">
            <div class="section-item-copy">
              <strong>{{ item.title }}</strong>
              @if (item.subtitle) {
                <small>{{ item.subtitle }}</small>
              }
              @if (item.meta) {
                <small class="section-item-meta">{{ item.meta }}</small>
              }
            </div>
            <div class="section-item-side">
              @if (item.badge) {
                <span class="section-item-badge">{{ item.badge }}</span>
              }
              @if (item.value) {
                <span class="section-item-value">{{ item.value }}</span>
              }
            </div>
          </article>
        } @empty {
          <p class="muted section-empty">Sin datos para mostrar.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .section-card {
      display: grid;
      gap: 0.85rem;
      height: 100%;
    }

    .section-head h3 {
      margin: 0;
    }

    .section-head p {
      margin: 0.35rem 0 0;
    }

    .section-list {
      display: grid;
      gap: 0.65rem;
    }

    .section-item {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.85rem 0.95rem;
      border-radius: 0.9rem;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .section-item-copy {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .section-item-copy strong {
      color: #0f172a;
    }

    .section-item-copy small {
      color: #64748b;
    }

    .section-item-meta {
      color: #94a3b8 !important;
    }

    .section-item-side {
      display: grid;
      gap: 0.25rem;
      justify-items: end;
      flex-shrink: 0;
    }

    .section-item-badge {
      padding: 0.12rem 0.45rem;
      border-radius: 999px;
      background: #eef2ff;
      color: #4338ca;
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .section-item-value {
      flex-shrink: 0;
      font-size: 0.82rem;
      font-weight: 700;
      color: #1d4ed8;
      white-space: nowrap;
    }

    .section-item--warning {
      border-color: #fcd34d;
      background: #fffbeb;
    }

    .section-item--danger {
      border-color: #fca5a5;
      background: #fef2f2;
    }

    .section-item--success {
      border-color: #86efac;
      background: #f0fdf4;
    }

    .section-item--info {
      border-color: #93c5fd;
      background: #eff6ff;
    }

    .section-empty {
      margin: 0;
    }
  `,
})
export class DashboardSectionCardComponent {
  readonly section = input.required<DashboardSection>();

  toneClass(tone?: string): string {
    return tone && tone !== 'default' ? `section-item--${tone}` : '';
  }
}
