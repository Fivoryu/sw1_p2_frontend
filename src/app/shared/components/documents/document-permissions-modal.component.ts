import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Department, Role, User } from '../../../core/models/admin.models';
import { DocumentGranteeType, DocumentPermissionValue, WorkflowDocumentPermissionApi } from '../../../core/models/workflow.models';
import { AdminService } from '../../../core/services/admin.service';
import { WorkflowService } from '../../../core/services/workflow.service';

const PERMISSION_OPTIONS: Array<{ value: DocumentPermissionValue; label: string }> = [
  { value: 'read', label: 'Leer' },
  { value: 'write', label: 'Escribir' },
  { value: 'sign', label: 'Firmar' },
  { value: 'validate_signature', label: 'Validar firma' },
  { value: 'admin', label: 'Administrar' },
];

@Component({
  selector: 'app-document-permissions-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-permissions-modal.component.html',
  styleUrl: './document-permissions-modal.component.scss',
})
export class DocumentPermissionsModalComponent {
  private readonly adminService = inject(AdminService);
  private readonly workflowService = inject(WorkflowService);

  readonly documentId = input.required<string>();
  readonly documentName = input('');
  readonly close = output<void>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly permissions = signal<WorkflowDocumentPermissionApi[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly granteeType = signal<DocumentGranteeType>('user');
  readonly granteeId = signal('');
  readonly selectedPermissions = signal<DocumentPermissionValue[]>(['read']);

  readonly permissionOptions = PERMISSION_OPTIONS;
  readonly granteeOptions = computed(() => {
    if (this.granteeType() === 'role') {
      return this.roles().map((role) => ({ id: role.name, label: role.name }));
    }
    if (this.granteeType() === 'department') {
      return this.departments().map((department) => ({ id: department.id, label: department.name }));
    }
    return this.users().map((user) => ({ id: user.id, label: `${user.full_name} · ${user.email}` }));
  });

  constructor() {
    effect(() => {
      if (this.documentId()) {
        this.loadData();
      }
    });
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      permissions: this.workflowService.getDocumentPermissions(this.documentId()),
      users: this.adminService.listUsers(),
      roles: this.adminService.listRoles(),
      departments: this.adminService.listDepartments(),
    }).subscribe({
      next: ({ permissions, users, roles, departments }) => {
        this.permissions.set(permissions.permissions);
        this.users.set(users.filter((user) => user.is_active));
        this.roles.set(roles);
        this.departments.set(departments);
        this.granteeId.set(this.granteeOptions()[0]?.id ?? '');
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudieron cargar los permisos documentales');
        this.loading.set(false);
      },
    });
  }

  setGranteeType(type: DocumentGranteeType): void {
    this.granteeType.set(type);
    this.granteeId.set('');
    queueMicrotask(() => this.granteeId.set(this.granteeOptions()[0]?.id ?? ''));
  }

  togglePermission(value: DocumentPermissionValue, checked: boolean): void {
    const current = new Set(this.selectedPermissions());
    if (checked) {
      current.add(value);
    } else {
      current.delete(value);
    }
    this.selectedPermissions.set([...current]);
  }

  hasSelectedPermission(value: DocumentPermissionValue): boolean {
    return this.selectedPermissions().includes(value);
  }

  submit(): void {
    if (!this.granteeId() || !this.selectedPermissions().length) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.workflowService.grantDocumentPermission(this.documentId(), {
      grantee_type: this.granteeType(),
      grantee_id: this.granteeId(),
      permissions: this.selectedPermissions(),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadData();
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo guardar el permiso');
        this.saving.set(false);
      },
    });
  }

  revoke(permissionId: string): void {
    this.workflowService.revokeDocumentPermission(this.documentId(), permissionId).subscribe({
      next: () => this.loadData(),
      error: (error) => this.error.set(error?.error?.detail ?? 'No se pudo revocar el permiso'),
    });
  }

  closeModal(): void {
    this.close.emit();
  }
}
