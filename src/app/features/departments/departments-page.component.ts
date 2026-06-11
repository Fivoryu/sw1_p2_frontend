import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Department, AuditLog } from '../../core/models/admin.models';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { UiIconComponent } from '../../shared/components/ui-icon.component';

@Component({
  selector: 'app-departments-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiIconComponent],
  templateUrl: './departments-page.component.html',
  styleUrl: './departments-page.component.scss',
})
export class DepartmentsPageComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly departments = signal<Department[]>([]);
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly editingDepartmentId = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly searchTerm = signal('');
  readonly canWrite = computed(() => this.authService.canWriteAdminData());
  readonly canReadAudit = computed(() => this.authService.hasPermission('audit:read'));
  readonly filteredDepartments = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    return this.departments().filter((department) => {
      return (
        !search ||
        department.name.toLowerCase().includes(search) ||
        department.code.toLowerCase().includes(search) ||
        department.description.toLowerCase().includes(search)
      );
    });
  });
  readonly departmentsWithCode = computed(() => this.departments().filter((department) => !!department.code).length);
  readonly hasActiveFilters = computed(() => !!this.searchTerm().trim());

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required]],
    description: ['', [Validators.required]],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminService.listDepartments().subscribe({
      next: (departments) => {
        this.departments.set(departments);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar los departamentos');
        this.loading.set(false);
      },
    });

    if (this.canReadAudit()) {
      this.adminService.listAudit(10).subscribe({ next: (logs) => this.auditLogs.set(logs) });
    }
  }

  startEdit(department: Department): void {
    this.modalOpen.set(true);
    this.editingDepartmentId.set(department.id);
    this.form.setValue({
      name: department.name,
      code: department.code,
      description: department.description,
    });
  }

  openCreateModal(): void {
    this.resetForm();
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.resetForm();
    this.error.set('');
  }

  resetForm(): void {
    this.editingDepartmentId.set(null);
    this.form.reset({ name: '', code: '', description: '' });
  }

  submit(): void {
    if (!this.canWrite() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const request$ = this.editingDepartmentId()
      ? this.adminService.updateDepartment(this.editingDepartmentId()!, this.form.getRawValue())
      : this.adminService.createDepartment(this.form.getRawValue());

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.reload();
      },
      error: (error) => {
        this.saving.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo guardar el departamento');
      },
    });
  }

  remove(department: Department): void {
    if (!this.canWrite() || !confirm(`¿Eliminar el departamento "${department.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    this.adminService.deleteDepartment(department.id).subscribe({
      next: () => this.reload(),
      error: (error) => this.error.set(error?.error?.detail ?? 'No se pudo eliminar el departamento'),
    });
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
  }

  auditActionLabel(action: string): string {
    return action.replaceAll('_', ' ');
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
