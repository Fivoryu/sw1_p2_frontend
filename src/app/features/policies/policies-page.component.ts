import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { User } from '../../core/models/admin.models';
import { AIPolicyGenerateResponse, Policy, PolicyCollaborator } from '../../core/models/policy.models';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomSelectComponent, SelectOption } from '../../shared/ui/custom-select/custom-select.component';
import { DashboardBarChartComponent } from '../../shared/components/dashboard/dashboard-bar-chart.component';
import { DashboardDonutChartComponent } from '../../shared/components/dashboard/dashboard-donut-chart.component';
import { DashboardChartPoint } from '../../core/models/dashboard.models';
import { PolicyCollaboratorsModalComponent } from './policy-collaborators-modal.component';

interface CreatorSuggestion {
  id: string;
  label: string;
  email: string;
}

type PoliciesSection = 'overview' | 'catalog';

@Component({
  selector: 'app-policies-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CustomSelectComponent, PolicyCollaboratorsModalComponent, DashboardBarChartComponent, DashboardDonutChartComponent],
  templateUrl: './policies-page.component.html',
  styleUrl: './policies-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PoliciesPageComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly policies = signal<Policy[]>([]);
  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly modalOpen = signal(false);
  readonly shareModalPolicy = signal<Policy | null>(null);
  readonly shareCollaborators = signal<PolicyCollaborator[]>([]);
  readonly searchTerm = signal('');
  readonly selectedCategory = signal('all');
  readonly creatorQuery = signal('');
  readonly selectedCreator = signal<CreatorSuggestion | null>(null);
  readonly creatorDropdownOpen = signal(false);
  readonly activeSection = signal<PoliciesSection>('catalog');
  readonly aiGenerating = signal(false);
  readonly aiPrompt = signal('');
  readonly aiRecording = signal(false);
  readonly aiAudioLoading = signal(false);
  readonly aiTranscribedText = signal('');
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  readonly currentPage = signal(1);
  readonly pageSize = signal(6);
  readonly pageSizeOptions = [6, 12, 24] as const;
  readonly canWrite = computed(() => this.authService.canWriteAdminData());
  readonly creatorSuggestions = computed(() => {
    if (this.selectedCreator()) {
      return [];
    }

    const query = this.creatorQuery().trim().toLowerCase();
    if (query.length < 1) {
      return [];
    }

    const seen = new Set<string>();
    const results: CreatorSuggestion[] = [];

    for (const user of this.users()) {
      const matches =
        user.full_name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      if (!matches || seen.has(user.id)) {
        continue;
      }

      seen.add(user.id);
      results.push({
        id: user.id,
        label: user.full_name,
        email: user.email,
      });
    }

    for (const policy of this.policies()) {
      if (seen.has(policy.created_by)) {
        continue;
      }

      const matches =
        policy.created_by_name.toLowerCase().includes(query) ||
        policy.created_by.toLowerCase().includes(query);
      if (!matches) {
        continue;
      }

      seen.add(policy.created_by);
      results.push({
        id: policy.created_by,
        label: policy.created_by_name,
        email: '',
      });
    }

    return results.slice(0, 8);
  });
  readonly filteredPolicies = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const category = this.selectedCategory();
    const creatorId = this.selectedCreator()?.id;

    return this.policies().filter((policy) => {
      const matchesSearch =
        !search ||
        policy.name.toLowerCase().includes(search) ||
        policy.description.toLowerCase().includes(search);
      const matchesCategory = category === 'all' || policy.category === category;
      const matchesCreator = !creatorId || policy.created_by === creatorId;

      return matchesSearch && matchesCategory && matchesCreator;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredPolicies().length / this.pageSize())));

  readonly paginatedPolicies = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPolicies().slice(start, start + this.pageSize());
  });

  readonly pageRangeLabel = computed(() => {
    const total = this.filteredPolicies().length;
    if (!total) {
      return '0 resultados';
    }
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `${start}-${end} de ${total}`;
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

  readonly categories = computed(() => [...new Set(this.policies().map((policy) => policy.category))]);

  readonly draftCount = computed(() => this.policies().filter((policy) => policy.status === 'draft').length);
  readonly publishedCount = computed(() => this.policies().filter((policy) => policy.status === 'published').length);
  readonly collaboratorTotal = computed(() =>
    this.policies().reduce((sum, policy) => sum + (policy.collaborators?.length ?? 0), 0),
  );

  readonly statusChartPoints = computed<DashboardChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const policy of this.policies()) {
      counts.set(policy.status, (counts.get(policy.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, value]) => ({
      label: this.statusLabel(status),
      value,
      tone: status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'info',
    }));
  });

  readonly categoryChartPoints = computed<DashboardChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const policy of this.policies()) {
      counts.set(policy.category, (counts.get(policy.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  });

  readonly categoryFilterOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: 'Todas' },
    ...this.categories().map((category) => ({ value: category, label: category })),
  ]);

  readonly filtersForm = this.fb.nonNullable.group({
    category: ['all'],
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(3)]],
    category: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor() {
    this.filtersForm.valueChanges.subscribe((values) => {
      this.selectedCategory.set(values.category ?? 'all');
      this.resetPage();
    });
    this.loadUsers();
    this.reload();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.creator-autocomplete')) {
      this.creatorDropdownOpen.set(false);
    }
  }

  private loadUsers(): void {
    this.adminService.listUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.users.set([]),
    });
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminService.listPolicies().subscribe({
      next: (policies) => {
        this.policies.set(policies);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar las políticas');
        this.loading.set(false);
      },
    });
  }

  openCreateModal(): void {
    this.form.reset({ name: '', description: '', category: '' });
    this.error.set('');
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.error.set('');
    this.aiPrompt.set('');
    this.aiTranscribedText.set('');
    this.aiRecording.set(false);
  }

  generateWithAi(): void {
    if (!this.canWrite() || !this.aiPrompt().trim() || this.aiGenerating()) {
      return;
    }
    this.aiGenerating.set(true);
    this.error.set('');
    this.adminService.generatePolicyFromText(this.aiPrompt()).subscribe({
      next: (result: AIPolicyGenerateResponse) => {
        this.aiGenerating.set(false);
        this.closeModal();
        this.reload();
        this.router.navigate(['/panel/politicas', result.id, 'editor']);
      },
      error: (error) => {
        this.aiGenerating.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo generar la politica con IA');
      },
    });
  }

  async toggleAiRecording(): Promise<void> {
    if (this.aiRecording()) {
      this.mediaRecorder?.stop();
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
        this.sendAiAudio(new Blob(this.audioChunks, { type: 'audio/webm' }));
      };
      this.aiTranscribedText.set('');
      this.mediaRecorder.start();
      this.aiRecording.set(true);
    } catch {
      this.aiRecording.set(false);
    }
  }

  private sendAiAudio(blob: Blob): void {
    this.aiRecording.set(false);
    this.aiAudioLoading.set(true);
    this.error.set('');
    this.adminService.generatePolicyFromAudio(blob).subscribe({
      next: (result: AIPolicyGenerateResponse) => {
        this.aiAudioLoading.set(false);
        this.aiTranscribedText.set(result.transcribed_text || '');
        this.aiPrompt.set(result.transcribed_text || '');
        this.closeModal();
        this.reload();
        this.router.navigate(['/panel/politicas', result.id, 'editor']);
      },
      error: (error) => {
        this.aiAudioLoading.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo generar la politica desde audio');
      },
    });
  }

  submit(): void {
    if (!this.canWrite() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.adminService.createPolicyDraft(this.form.getRawValue()).subscribe({
      next: (policy) => {
        this.saving.set(false);
        this.closeModal();
        this.reload();
        this.router.navigate(['/panel/politicas', policy.id, 'editor']);
      },
      error: (error) => {
        this.saving.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo crear el borrador');
      },
    });
  }

  openEditor(policy: Policy): void {
    this.router.navigate(['/panel/politicas', policy.id, 'editor']);
  }

  canSharePolicy(policy: Policy): boolean {
    const current = this.authService.getCurrentUser();
    return policy.status === 'draft' && !!current && policy.created_by === current.id;
  }

  collaboratorCount(policy: Policy): number {
    return policy.collaborators?.length ?? 0;
  }

  openShareModal(policy: Policy, event?: Event): void {
    event?.stopPropagation();
    this.shareModalPolicy.set(policy);
    this.adminService.listPolicyCollaborators(policy.id).subscribe({
      next: (collaborators) => this.shareCollaborators.set(collaborators),
      error: () => this.shareCollaborators.set(policy.collaborators ?? []),
    });
  }

  closeShareModal(): void {
    this.shareModalPolicy.set(null);
    this.shareCollaborators.set([]);
  }

  onCollaboratorsUpdated(collaborators: PolicyCollaborator[]): void {
    this.shareCollaborators.set(collaborators);
    const policyId = this.shareModalPolicy()?.id;
    if (!policyId) {
      return;
    }

    this.policies.update((items) =>
      items.map((policy) => (policy.id === policyId ? { ...policy, collaborators } : policy))
    );
  }

  currentUserId(): string {
    return this.authService.getCurrentUser()?.id ?? '';
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.resetPage();
  }

  setSection(section: PoliciesSection): void {
    this.activeSection.set(section);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.resetPage();
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

  onCreatorQueryInput(value: string): void {
    this.creatorQuery.set(value);
    this.creatorDropdownOpen.set(value.trim().length > 0);
    this.resetPage();
  }

  openCreatorDropdown(event: Event): void {
    event.stopPropagation();
    if (this.creatorQuery().trim().length > 0) {
      this.creatorDropdownOpen.set(true);
    }
  }

  selectCreator(suggestion: CreatorSuggestion, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedCreator.set(suggestion);
    this.creatorQuery.set('');
    this.creatorDropdownOpen.set(false);
    this.resetPage();
  }

  clearCreatorFilter(event?: Event): void {
    event?.stopPropagation();
    this.selectedCreator.set(null);
    this.creatorQuery.set('');
    this.creatorDropdownOpen.set(false);
    this.resetPage();
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.clearCreatorFilter();
    this.filtersForm.reset({ category: 'all' });
    this.resetPage();
  }

  private resetPage(): void {
    this.currentPage.set(1);
  }

  statusLabel(status: string): string {
    return {
      draft: 'Borrador',
      published: 'Publicada',
      archived: 'Archivada',
    }[status] ?? status;
  }

  statusClass(status: string): string {
    return `policy-status--${status}`;
  }

  formatUpdatedAt(value: string): string {
    if (!value) {
      return '—';
    }
    return new Date(value).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
