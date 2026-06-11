import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Department, Role, User } from '../../core/models/admin.models';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomSelectComponent, SelectOption } from '../../shared/ui/custom-select/custom-select.component';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPageComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly editingUserId = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly searchTerm = signal('');
  readonly selectedRole = signal('all');
  readonly selectedDepartment = signal('all');
  readonly selectedStatus = signal('all');
  readonly canWrite = computed(() => this.authService.canWriteAdminData());
  readonly filteredUsers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const role = this.selectedRole();
    const department = this.selectedDepartment();
    const status = this.selectedStatus();

    return this.users().filter((user) => {
      const matchesSearch =
        !search ||
        user.full_name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);
      const matchesRole = role === 'all' || user.role_id === role;
      const matchesDepartment = department === 'all' || (user.department_id ?? 'none') === department;
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && user.is_active) ||
        (status === 'inactive' && !user.is_active);

      return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
    });
  });
  readonly activeUsersCount = computed(() => this.users().filter((user) => user.is_active).length);
  readonly inactiveUsersCount = computed(() => this.users().filter((user) => !user.is_active).length);

  readonly statusFilterOptions: SelectOption[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
  ];

  readonly roleFilterOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: 'Todos' },
    ...this.roles().map((role) => ({ value: role.id, label: role.name })),
  ]);

  readonly departmentFilterOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: 'Todos' },
    { value: 'none', label: 'Sin departamento' },
    ...this.departments().map((department) => ({ value: department.id, label: department.name })),
  ]);

  readonly roleFormOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Seleccionar rol' },
    ...this.roles().map((role) => ({ value: role.id, label: role.name })),
  ]);

  readonly departmentFormOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Sin departamento' },
    ...this.departments().map((department) => ({ value: department.id, label: department.name })),
  ]);

  readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role_id: ['', [Validators.required]],
    department_id: [''],
    is_active: [true],
  });

  readonly filtersForm = this.fb.nonNullable.group({
    role: ['all'],
    department: ['all'],
    status: ['all'],
  });

  constructor() {
    this.filtersForm.valueChanges.subscribe((values) => {
      this.selectedRole.set(values.role ?? 'all');
      this.selectedDepartment.set(values.department ?? 'all');
      this.selectedStatus.set(values.status ?? 'all');
    });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      users: this.adminService.listUsers(),
      roles: this.adminService.listRoles(),
      departments: this.adminService.listDepartments(),
    }).subscribe({
      next: ({ users, roles, departments }) => {
        this.users.set(users);
        this.roles.set(roles);
        this.departments.set(departments);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar los usuarios');
        this.loading.set(false);
      },
    });
  }

  startEdit(user: User): void {
    this.modalOpen.set(true);
    this.editingUserId.set(user.id);
    this.form.patchValue({
      full_name: user.full_name,
      email: user.email,
      password: '',
      role_id: user.role_id,
      department_id: user.department_id ?? '',
      is_active: user.is_active,
    });
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
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
    this.editingUserId.set(null);
    this.form.reset({ full_name: '', email: '', password: '', role_id: '', department_id: '', is_active: true });
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
  }

  submit(): void {
    if (!this.canWrite() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();
    const body: Record<string, unknown> = {
      full_name: raw.full_name,
      email: raw.email,
      role_id: raw.role_id,
      department_id: raw.department_id || null,
      is_active: raw.is_active,
    };

    if (raw.password) {
      body['password'] = raw.password;
    }

    const request$ = this.editingUserId()
      ? this.adminService.updateUser(this.editingUserId()!, body)
      : this.adminService.createUser({ ...body, password: raw.password });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.reload();
      },
      error: (error) => {
        this.saving.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo guardar el usuario');
      },
    });
  }

  deactivate(user: User): void {
    if (!this.canWrite() || !confirm(`Desactivar a ${user.full_name}?`)) {
      return;
    }

    this.adminService.deactivateUser(user.id).subscribe({
      next: () => this.reload(),
      error: (error) => this.error.set(error?.error?.detail ?? 'No se pudo desactivar el usuario'),
    });
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filtersForm.reset({ role: 'all', department: 'all', status: 'all' });
  }
}
