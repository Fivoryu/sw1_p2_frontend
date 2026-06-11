import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { AIReportResponseApi } from '../../core/models/ai.models';
import {
  badgeClass,
  columnLabel,
  formatFilterLabel,
  isBadgeColumn,
  isDateColumn,
} from './report-display.utils';

@Component({
  selector: 'app-ai-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-reports-page.component.html',
  styleUrls: ['./ai-reports-page.component.scss'],
})
export class AiReportsPageComponent {
  private readonly ai = inject(AiService);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  readonly query = signal('Muéstrame trámites activos de Operaciones este mes por departamento');
  readonly loading = signal(false);
  readonly audioLoading = signal(false);
  readonly recording = signal(false);
  readonly transcribedText = signal('');
  readonly error = signal('');
  readonly report = signal<AIReportResponseApi | null>(null);
  readonly exporting = signal('');
  readonly exportError = signal('');

  readonly exportOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'excel', label: 'Excel' },
    { value: 'csv', label: 'CSV' },
    { value: 'txt', label: 'TXT' },
    { value: 'json', label: 'JSON' },
    { value: 'html', label: 'HTML' },
  ] as const;
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50] as const;

  readonly quickExamples = [
    'Muéstrame trámites activos este mes',
    'Dame documentos con más de 2 versiones agrupados por usuario',
    'Cuántas tareas pendientes hay por departamento',
    'Eventos de auditoría agrupados por recurso en los últimos 7 días',
    'Políticas de negocio hechas por el admin',
    'Documentos sin firma del trámite de Operaciones subidos por María López con más de 3 versiones',
    'Trámites de la política Solicitud de nuevo medidor riesgo alto completados mayo por departamento con tiempo promedio',
    'Tareas atrasadas de Recursos Humanos prioridad alta por funcionario',
    'Políticas publicadas de categoría financiero por categoría',
    'Usuarios activos de Operaciones con rol administrador por rol',
    'Documentos firmados de la actividad de Archivo esta semana por firma con versiones',
    'Eventos de auditoría de documento firmado este mes por acción',
    'Trámites pendientes de Tesorería por estado con porcentaje',
    'Tareas del workflow de Atención al Cliente prioridad media por prioridad',
  ];

  readonly detectedFilters = computed(() => {
    const filters = this.report()?.filters ?? {};
    return Object.entries(filters).map(([key, value]) => formatFilterLabel(key, value));
  });

  readonly visibleColumns = computed(() => {
    const report = this.report();
    if (!report) {
      return [];
    }
    const hidden = new Set(report.hidden_columns ?? []);
    return report.columns.filter((column) => !hidden.has(column));
  });

  readonly totalPages = computed(() => {
    const total = this.report()?.rows.length ?? 0;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  readonly paginatedRows = computed(() => {
    const rows = this.report()?.rows ?? [];
    const start = (this.currentPage() - 1) * this.pageSize();
    return rows.slice(start, start + this.pageSize());
  });

  readonly pageRangeLabel = computed(() => {
    const total = this.report()?.rows.length ?? 0;
    if (!total) {
      return '0 resultados';
    }
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `Mostrando ${start}-${end} de ${total}`;
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    const end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly summaryCards = computed(() => {
    const report = this.report();
    if (!report?.rows.length) {
      return [];
    }
    const metric = report.metrics.find((item) => item !== 'cantidad') ?? report.metrics[0];
    const hasMetricColumn = metric && report.rows.some((row) => row[metric] !== undefined && row[metric] !== null);
    if (!hasMetricColumn) {
      return [{ label: 'Total de registros', value: report.rows.length }];
    }
    const total = report.rows.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0);
    return [{ label: columnLabel(metric, report.column_labels), value: total }];
  });

  columnLabel(column: string): string {
    const report = this.report();
    return columnLabel(column, report?.column_labels);
  }

  isDateColumn(column: string): boolean {
    return isDateColumn(column);
  }

  isBadgeColumn(column: string): boolean {
    return isBadgeColumn(column);
  }

  badgeClass(column: string, value: unknown): string {
    return badgeClass(column, value);
  }

  generate(): void {
    this.loading.set(true);
    this.error.set('');
    this.exportError.set('');
    this.currentPage.set(1);
    this.ai.generateReport(this.query(), 'dashboard').subscribe({
      next: (result) => {
        this.report.set(result);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo generar el reporte');
        this.loading.set(false);
      },
    });
  }

  async toggleRecording(): Promise<void> {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }
    this.error.set('');
    this.transcribedText.set('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.sendAudio(blob);
      };
      this.mediaRecorder.start();
      this.recording.set(true);
    } catch {
      this.error.set('No se pudo acceder al micrófono');
    }
  }

  sendAudio(blob: Blob): void {
    this.recording.set(false);
    this.audioLoading.set(true);
    this.loading.set(true);
    this.error.set('');
    this.currentPage.set(1);
    this.ai.generateReportFromAudio(blob, 'dashboard').subscribe({
      next: (result) => {
        this.report.set(result);
        this.query.set(result.transcribed_text || result.query);
        this.transcribedText.set(result.transcribed_text || result.query);
        this.audioLoading.set(false);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo generar el reporte por audio');
        this.audioLoading.set(false);
        this.loading.set(false);
      },
    });
  }

  exportAs(format: string): void {
    const report = this.report();
    if (!report || this.exporting()) {
      return;
    }
    this.exporting.set(format);
    this.exportError.set('');
    this.ai
      .exportReport({
        title: report.title,
        columns: report.columns,
        column_labels: report.column_labels,
        hidden_columns: report.hidden_columns,
        rows: report.rows,
        export_format: format,
      })
      .subscribe({
        next: (payload) => {
          this.triggerDownload(payload.export_content_base64, payload.file_name, payload.mime_type);
          this.exporting.set('');
        },
        error: (error) => {
          this.exportError.set(error?.error?.detail ?? 'No se pudo exportar el reporte');
          this.exporting.set('');
        },
      });
  }

  useExample(example: string): void {
    this.query.set(example);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  previousPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  private triggerDownload(base64: string, fileName: string, mimeType: string | null): void {
    if (!base64 || !fileName) {
      return;
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  trackByColumn(_: number, column: string): string {
    return column;
  }

  trackByRow(index: number): number {
    return index;
  }
}
