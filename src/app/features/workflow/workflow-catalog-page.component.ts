import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkflowCatalogEntry } from '../../core/models/workflow.models';
import { AIClassifySuggestionApi } from '../../core/models/ai.models';
import { AiService } from '../../core/services/ai.service';
import { WorkflowService } from '../../core/services/workflow.service';

@Component({
  selector: 'app-workflow-catalog-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-catalog-page.component.html',
  styleUrls: ['./workflow-catalog-page.component.scss'],
})
export class WorkflowCatalogPageComponent {
  readonly workflowService = inject(WorkflowService);
  private readonly aiService = inject(AiService);

  readonly searchTerm = signal('');
  readonly requestText = signal('');
  readonly aiSuggestions = signal<AIClassifySuggestionApi[]>([]);
  readonly aiLoading = signal(false);
  readonly aiRecording = signal(false);
  readonly aiAudioStatus = signal('');
  readonly transcribedText = signal('');
  readonly categoryFilter = signal<'all' | string>('all');
  readonly selectedPolicyId = signal<string | null>(this.workflowService.catalog()[0]?.id ?? null);
  readonly catalog = this.workflowService.catalog;
  readonly totalPolicies = computed(() => this.catalog().length);
  readonly totalSteps = computed(() => this.catalog().reduce((sum, item) => sum + item.steps, 0));
  readonly totalForms = computed(() => this.catalog().reduce((sum, item) => sum + item.forms, 0));
  readonly avgSteps = computed(() => {
    const total = this.totalPolicies();
    return total ? Math.round(this.totalSteps() / total) : 0;
  });
  readonly categories = computed(() => {
    const values = new Set(this.catalog().map((item) => item.category).filter(Boolean));
    return ['all', ...Array.from(values).sort((left, right) => left.localeCompare(right, 'es'))];
  });
  readonly highlightedSuggestions = computed(() => new Set(this.aiSuggestions().map((item) => item.policy_id)));

  readonly filteredCatalog = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const category = this.categoryFilter();
    const aiSuggestedIds = this.highlightedSuggestions();
    return this.catalog()
      .filter((item) => category === 'all' || item.category === category)
      .filter((item) =>
        !search ||
        [item.policyName, item.category, item.targetDepartment]
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
      .sort((left, right) => {
        const leftSuggested = aiSuggestedIds.has(left.id) ? 1 : 0;
        const rightSuggested = aiSuggestedIds.has(right.id) ? 1 : 0;
        if (leftSuggested !== rightSuggested) {
          return rightSuggested - leftSuggested;
        }
        return left.policyName.localeCompare(right.policyName, 'es');
      });
  });

  readonly visibleCatalog = computed(() => this.filteredCatalog().slice(0, 18));
  readonly hiddenCount = computed(() => Math.max(0, this.filteredCatalog().length - this.visibleCatalog().length));

  readonly selectedPolicy = computed(() => {
    const selectedId = this.selectedPolicyId();
    return this.filteredCatalog().find((item) => item.id === selectedId) ?? this.filteredCatalog()[0] ?? null;
  });
  readonly compactSummary = computed(() => {
    const total = this.filteredCatalog().length;
    const suggestions = this.aiSuggestions().length;
    const category = this.categoryFilter();
    if (!total) {
      return 'No hay políticas que coincidan con el filtro actual.';
    }
    if (suggestions) {
      return `${suggestions} sugerencia(s) destacadas y ${total} política(s) coinciden con el contexto actual.`;
    }
    if (category !== 'all') {
      return `${total} política(s) disponibles en ${category}.`;
    }
    return `${total} política(s) disponibles. Usa filtros o el asistente para reducir opciones.`;
  });

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];

  constructor() {
    effect(() => {
      const items = this.filteredCatalog();
      if (!items.length) {
        this.selectedPolicyId.set(null);
        return;
      }
      if (!this.selectedPolicyId() || !items.some((item) => item.id === this.selectedPolicyId())) {
        this.selectedPolicyId.set(items[0].id);
      }
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    const selectedId = this.selectedPolicyId();
    if (selectedId && this.filteredCatalog().some((item) => item.id === selectedId)) {
      return;
    }
    this.selectedPolicyId.set(this.filteredCatalog()[0]?.id ?? null);
  }

  onCategoryChange(value: string): void {
    this.categoryFilter.set(value);
    const selectedId = this.selectedPolicyId();
    if (selectedId && this.filteredCatalog().some((item) => item.id === selectedId)) {
      return;
    }
    this.selectedPolicyId.set(this.filteredCatalog()[0]?.id ?? null);
  }

  selectPolicy(policyId: string): void {
    this.selectedPolicyId.set(policyId);
  }

  startSelectedWorkflow(): void {
    const policy = this.selectedPolicy();
    if (!policy) {
      return;
    }
    this.workflowService.startWorkflow(policy.id, `Inicio desde catálogo para ${policy.policyName}`);
  }

  suggestPolicy(): void {
    if (!this.requestText().trim()) {
      return;
    }
    this.aiLoading.set(true);
    this.aiService.classifyRequest(this.requestText()).subscribe({
      next: (result) => {
        this.aiSuggestions.set(result.suggestions);
        if (result.suggestions[0]) {
          this.selectedPolicyId.set(result.suggestions[0].policy_id);
        }
        this.aiLoading.set(false);
      },
      error: () => {
        this.aiSuggestions.set([]);
        this.aiLoading.set(false);
      },
    });
  }

  async toggleRecording(): Promise<void> {
    if (this.aiRecording()) {
      this.mediaRecorder?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.aiAudioStatus.set('El navegador no permite grabar audio.');
      return;
    }

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
        this.aiRecording.set(false);
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.sendAudio(blob);
      };
      this.mediaRecorder.start();
      this.aiRecording.set(true);
      this.aiAudioStatus.set('Grabando solicitud...');
    } catch {
      this.aiRecording.set(false);
      this.aiAudioStatus.set('No se pudo acceder al micrófono.');
    }
  }

  private sendAudio(blob: Blob): void {
    this.aiLoading.set(true);
    this.aiAudioStatus.set('Transcribiendo y clasificando...');
    this.aiService.classifyRequestFromAudio(blob).subscribe({
      next: (result) => {
        this.transcribedText.set(result.transcribed_text ?? '');
        if (result.transcribed_text) {
          this.requestText.set(result.transcribed_text);
        }
        this.aiSuggestions.set(result.suggestions);
        if (result.suggestions[0]) {
          this.selectedPolicyId.set(result.suggestions[0].policy_id);
        }
        this.aiAudioStatus.set('Solicitud de voz analizada.');
        this.aiLoading.set(false);
      },
      error: () => {
        this.aiSuggestions.set([]);
        this.aiAudioStatus.set('No se pudo clasificar el audio.');
        this.aiLoading.set(false);
      },
    });
  }

  confidenceLabel(confidence: number): string {
    if (confidence >= 0.8) {
      return 'Alta coincidencia';
    }
    if (confidence >= 0.55) {
      return 'Coincidencia media';
    }
    return 'Coincidencia exploratoria';
  }

  confidenceClass(confidence: number): string {
    if (confidence >= 0.8) {
      return 'suggestion-pill suggestion-pill--high';
    }
    if (confidence >= 0.55) {
      return 'suggestion-pill suggestion-pill--medium';
    }
    return 'suggestion-pill suggestion-pill--low';
  }

  cardTone(item: WorkflowCatalogEntry): string {
    return this.highlightedSuggestions().has(item.id) ? 'catalog-card catalog-card--suggested' : 'catalog-card';
  }
}
