import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Role } from '../../core/models/admin.models';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomSelectComponent, SelectOption } from '../../shared/ui/custom-select/custom-select.component';

const AVAILABLE_PERMISSIONS = [
  'users:read',
  'users:write',
  'roles:read',
  'roles:write',
  'departments:read',
  'departments:write',
  'policies:read',
  'policies:write',
  'audit:read',
  'documents:read',
  'documents:write',
  'documents:sign',
  'documents:validate_signature',
  'documents:admin',
  'reports:read',
  'reports:ai',
  'ai:use',
];

@Component({
  selector: 'app-roles-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './roles-page.component.html',
  styleUrl: './roles-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesPageComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly roles = signal<Role[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly editingRoleId = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly searchTerm = signal('');
  readonly selectedMode = signal('all');
  readonly canWrite = computed(() => this.authService.canWriteAdminData());
  readonly permissions = AVAILABLE_PERMISSIONS;
  readonly filteredRoles = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const mode = this.selectedMode();

    return this.roles().filter((role) => {
      const matchesSearch =
        !search ||
        role.name.toLowerCase().includes(search) ||
        role.description.toLowerCase().includes(search);
      const matchesMode =
        mode === 'all' ||
        (mode === 'system' && role.is_system) ||
        (mode === 'custom' && !role.is_system);

      return matchesSearch && matchesMode;
    });
  });
  readonly systemRolesCount = computed(() => this.roles().filter((role) => role.is_system).length);
  readonly customRolesCount = computed(() => this.roles().filter((role) => !role.is_system).length);

  readonly modeFilterOptions: SelectOption[] = [
    { value: 'all', label: 'Todos' },
    { value: 'system', label: 'Base' },
    { value: 'custom', label: 'Personalizados' },
  ];

  readonly filtersForm = this.fb.nonNullable.group({
    mode: ['all'],
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: ['', [Validators.required]],
    permissions: this.fb.nonNullable.control<string[]>([]),
  });

  constructor() {
    this.filtersForm.valueChanges.subscribe((values) => {
      this.selectedMode.set(values.mode ?? 'all');
    });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.adminService.listRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar los roles');
        this.loading.set(false);
      },
    });
  }

  togglePermission(permission: string, enabled: boolean): void {
    const current = new Set(this.form.controls.permissions.value);
    if (enabled) {
      current.add(permission);
    } else {
      current.delete(permission);
    }
    this.form.controls.permissions.setValue([...current]);
  }

  startEdit(role: Role): void {
    this.modalOpen.set(true);
    this.editingRoleId.set(role.id);
    this.form.setValue({
      name: role.name,
      description: role.description,
      permissions: role.permissions.includes('*') ? [] : role.permissions,
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
    this.editingRoleId.set(null);
    this.form.reset({ name: '', description: '', permissions: [] });
  }

  submit(): void {
    if (!this.canWrite() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const body = this.form.getRawValue();
    const request$ = this.editingRoleId()
      ? this.adminService.updateRole(this.editingRoleId()!, body)
      : this.adminService.createRole(body);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.reload();
      },
      error: (error) => {
        this.saving.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo guardar el rol');
      },
    });
  }

  remove(role: Role): void {
    if (!this.canWrite() || role.is_system || !confirm(`Eliminar rol ${role.name}?`)) {
      return;
    }

    this.adminService.deleteRole(role.id).subscribe({
      next: () => this.reload(),
      error: (error) => this.error.set(error?.error?.detail ?? 'No se pudo eliminar el rol'),
    });
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filtersForm.reset({ mode: 'all' });
  }

  hasFullAccess(role: Role): boolean {
    return role.permissions.includes('*');
  }

  permissionCountLabel(role: Role): string {
    if (this.hasFullAccess(role)) {
      return 'Acceso total';
    }
    const count = role.permissions.length;
    return count === 1 ? '1 permiso' : `${count} permisos`;
  }

  permissionSummary(role: Role): string {
    if (this.hasFullAccess(role)) {
      return 'Acceso completo al sistema';
    }
    if (!role.permissions.length) {
      return 'Sin permisos asignados';
    }
    return this.permissionCountLabel(role);
  }

  visiblePermissions(role: Role, limit = 6): string[] {
    if (this.hasFullAccess(role)) {
      return [];
    }
    return role.permissions.slice(0, limit);
  }

  hiddenPermissionsCount(role: Role, limit = 6): number {
    if (this.hasFullAccess(role)) {
      return 0;
    }
    return Math.max(0, role.permissions.length - limit);
  }
}
