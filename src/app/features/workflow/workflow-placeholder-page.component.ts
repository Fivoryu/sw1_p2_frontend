import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

interface WorkflowSection {
  title: string;
  body: string;
}

@Component({
  selector: 'app-workflow-placeholder-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="workflow-page">
      <header class="hero">
        <div>
          <p class="eyebrow">Etapa 1</p>
          <h1>{{ title() }}</h1>
          <p>{{ description() }}</p>
        </div>
        <div class="hero-badge">Base workflow activa</div>
      </header>

      <div class="highlights">
        <article class="highlight-card" *ngFor="let metric of metrics()">
          <span class="highlight-label">{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </div>

      <div class="sections">
        <article class="section-card" *ngFor="let section of sections()">
          <h2>{{ section.title }}</h2>
          <p>{{ section.body }}</p>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .workflow-page {
      display: grid;
      gap: 1.25rem;
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 1.5rem;
      background:
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.24), transparent 30%),
        linear-gradient(135deg, #0f172a, #111827 55%, #1e293b);
      color: #f8fafc;
      box-shadow: 0 30px 60px rgba(15, 23, 42, 0.18);
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #86efac;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(1.8rem, 3vw, 2.6rem);
    }

    .hero p {
      margin: 0.55rem 0 0;
      max-width: 62ch;
      color: #cbd5e1;
      line-height: 1.5;
    }

    .hero-badge {
      align-self: flex-start;
      padding: 0.75rem 1rem;
      border-radius: 999px;
      background: rgba(134, 239, 172, 0.14);
      border: 1px solid rgba(134, 239, 172, 0.35);
      color: #dcfce7;
      font-weight: 600;
      white-space: nowrap;
    }

    .highlights,
    .sections {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .highlight-card,
    .section-card {
      padding: 1.2rem;
      border-radius: 1.1rem;
      background: #ffffff;
      border: 1px solid #dbe4f0;
      box-shadow: 0 18px 35px rgba(15, 23, 42, 0.06);
    }

    .highlight-label {
      display: block;
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 0.4rem;
    }

    .highlight-card strong {
      font-size: 1.8rem;
      color: #0f172a;
    }

    .section-card h2 {
      margin: 0 0 0.55rem;
      font-size: 1rem;
      color: #0f172a;
    }

    .section-card p {
      margin: 0;
      color: #475569;
      line-height: 1.5;
    }

    @media (max-width: 820px) {
      .hero {
        flex-direction: column;
      }

      .hero-badge {
        align-self: flex-start;
      }
    }
  `],
})
export class WorkflowPlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = computed(() => this.route.snapshot.data['title'] as string ?? 'Workflow');
  readonly description = computed(() => this.route.snapshot.data['description'] as string ?? 'Vista base del funcionario.');
  readonly metrics = computed(() => (this.route.snapshot.data['metrics'] as Array<{ label: string; value: string }>) ?? []);
  readonly sections = computed(() => (this.route.snapshot.data['sections'] as WorkflowSection[]) ?? []);
}
