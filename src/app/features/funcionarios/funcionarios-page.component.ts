import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Department, User } from '../../core/models/admin.models';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomSelectComponent, SelectOption } from '../../shared/ui/custom-select/custom-select.component';

@Component({
  selector: 'app-funcionarios-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './funcionarios-page.component.html',
  styleUrls: ['./funcionarios-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuncionariosPageComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly successNotice = signal('');
  readonly searchTerm = signal('');
  readonly selectedDepartment = signal('all');
  readonly selectedStatus = signal<'all' | 'active' | 'inactive'>('all');
  readonly updatingUserId = signal<string | null>(null);
  readonly selectedUserIds = signal<string[]>([]);
  readonly bulkDepartmentId = signal('');
  readonly editingUser = signal<User | null>(null);
  readonly editDepartmentId = signal('');
  readonly canWrite = computed(() => this.authService.canWriteAdminData());

  readonly funcionarios = computed(() =>
    this.users().filter((user) => user.role_name === 'funcionario'),
  );

  readonly filteredFuncionarios = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const department = this.selectedDepartment();
    const status = this.selectedStatus();
    return this.funcionarios().filter((user) => {
      const matchesSearch =
        !search ||
        user.full_name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);
      const matchesDepartment = department === 'all' || (user.department_id ?? 'none') === department;
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && user.is_active) ||
        (status === 'inactive' && !user.is_active);
      return matchesSearch && matchesDepartment && matchesStatus;
    });
  });

  readonly funcionariosCount = computed(() => this.funcionarios().length);
  readonly activeFuncionariosCount = computed(() => this.funcionarios().filter((user) => user.is_active).length);
  readonly unassignedCount = computed(() => this.funcionarios().filter((user) => !user.department_id).length);
  readonly byDepartment = computed(() => {
    const counts = new Map<string, number>();
    for (const user of this.funcionarios()) {
      const key = user.department_name ?? 'Sin departamento';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = this.funcionariosCount() || 1;
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        total: count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'es'));
  });
  readonly departmentFilterOptions = computed((): SelectOption[] => [
    { value: 'all', label: 'Todos' },
    { value: 'none', label: 'Sin departamento' },
    ...this.departments().map((department) => ({ value: department.id, label: department.name })),
  ]);
  readonly departmentAssignOptions = computed((): SelectOption[] => [
    { value: '', label: 'Sin departamento' },
    ...this.departments().map((department) => ({ value: department.id, label: department.name })),
  ]);
  readonly statusFilterOptions: SelectOption[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
  ];
  readonly selectedCount = computed(() => this.selectedUserIds().length);
  readonly allVisibleSelected = computed(() => {
    const visibleIds = this.filteredFuncionarios().map((user) => user.id);
    return visibleIds.length > 0 && visibleIds.every((id) => this.selectedUserIds().includes(id));
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.successNotice.set('');
    forkJoin({
      users: this.adminService.listUsers(),
      departments: this.adminService.listDepartments(),
    }).subscribe({
      next: ({ users, departments }) => {
        this.users.set(users);
        this.departments.set(departments);
        this.selectedUserIds.set([]);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar los funcionarios');
        this.loading.set(false);
      },
    });
  }

  reassignDepartment(user: User, value: string): void {
    if (!this.canWrite()) {
      return;
    }
    const nextDepartmentId = value || null;
    if ((user.department_id ?? null) === nextDepartmentId) {
      return;
    }

    this.updatingUserId.set(user.id);
    this.error.set('');
    this.successNotice.set('');
    this.adminService.updateUser(user.id, { department_id: nextDepartmentId }).subscribe({
      next: (updated) => {
        this.users.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.updatingUserId.set(null);
        this.successNotice.set(`Departamento actualizado para ${updated.full_name}.`);
        if (this.editingUser()?.id === updated.id) {
          this.editingUser.set(updated);
          this.editDepartmentId.set(updated.department_id ?? '');
        }
      },
      error: (error) => {
        this.updatingUserId.set(null);
        this.error.set(error?.error?.detail ?? 'No se pudo actualizar el departamento del funcionario');
      },
    });
  }

  onDepartmentFilterChange(value: string): void {
    this.selectedDepartment.set(value);
  }

  onStatusFilterChange(value: string): void {
    this.selectedStatus.set(value as 'all' | 'active' | 'inactive');
  }

  showUnassignedOnly(): void {
    this.selectedDepartment.set('none');
    this.searchTerm.set('');
    this.selectedStatus.set('all');
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedDepartment.set('all');
    this.selectedStatus.set('all');
  }

  toggleSelectAllVisible(): void {
    const visibleIds = this.filteredFuncionarios().map((user) => user.id);
    if (!visibleIds.length) {
      return;
    }
    if (this.allVisibleSelected()) {
      this.selectedUserIds.update((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    this.selectedUserIds.update((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  toggleUserSelection(userId: string, checked: boolean): void {
    this.selectedUserIds.update((current) => {
      if (checked) {
        return Array.from(new Set([...current, userId]));
      }
      return current.filter((id) => id !== userId);
    });
  }

  applyBulkDepartment(): void {
    if (!this.canWrite() || !this.selectedCount() || !this.bulkDepartmentId()) {
      return;
    }
    const selectedIds = this.selectedUserIds();
    this.error.set('');
    this.successNotice.set('');
    this.updatingUserId.set('bulk');
    forkJoin(selectedIds.map((userId) => this.adminService.updateUser(userId, { department_id: this.bulkDepartmentId() }))).subscribe({
      next: (updatedUsers) => {
        const updatedMap = new Map(updatedUsers.map((user) => [user.id, user]));
        this.users.update((items) => items.map((item) => updatedMap.get(item.id) ?? item));
        this.selectedUserIds.set([]);
        this.bulkDepartmentId.set('');
        this.updatingUserId.set(null);
        this.successNotice.set(`Departamento reasignado para ${updatedUsers.length} funcionario(s).`);
      },
      error: (error) => {
        this.updatingUserId.set(null);
        this.error.set(error?.error?.detail ?? 'No se pudo completar la reasignación masiva');
      },
    });
  }

  openEdit(user: User): void {
    this.editingUser.set(user);
    this.editDepartmentId.set(user.department_id ?? '');
  }

  closeEdit(): void {
    this.editingUser.set(null);
    this.editDepartmentId.set('');
  }

  saveEdit(): void {
    const user = this.editingUser();
    if (!user) {
      return;
    }
    this.reassignDepartment(user, this.editDepartmentId());
    this.closeEdit();
  }

  statusLabel(user: User): string {
    return user.is_active ? 'Activo' : 'Inactivo';
  }

}
