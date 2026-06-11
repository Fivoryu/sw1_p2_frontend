import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { PolicyCollaborator } from '../../core/models/policy.models';
import { User } from '../../core/models/admin.models';

@Component({
  selector: 'app-policy-collaborators-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onClose()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Gestionar colaboradores</h2>
          <button class="close-btn" (click)="onClose()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Current collaborators -->
          <div class="section">
            <h3>Colaboradores actuales</h3>
            @if (collaborators().length === 0) {
              <p class="empty-text">No hay colaboradores agregados</p>
            } @else {
              <div class="collaborators-list">
                @for (collab of collaborators(); track collab.user_id) {
                  <div class="collaborator-item">
                    <div class="collab-info">
                      <div class="collab-name">{{ collab.user_name }}</div>
                      <div class="collab-email">{{ collab.user_email }}</div>
                      <div class="collab-role">{{ collab.role === 'owner' ? 'Propietario' : 'Editor' }}</div>
                    </div>
                    @if (canRemove(collab)) {
                      <button
                        class="remove-btn"
                        (click)="onRemoveCollaborator(collab.user_id)"
                        [disabled]="isRemoving()"
                      >
                        Remover
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Add collaborator -->
          <div class="section">
            <h3>Invitar nuevo colaborador</h3>
            <div class="add-form">
              <select
                [(ngModel)]="selectedUserId"
                class="user-select"
                [disabled]="isAdding()"
              >
                <option value="">Seleccionar usuario...</option>
                @for (user of availableUsers(); track user.id) {
                  <option [value]="user.id">{{ user.full_name }} ({{ user.email }})</option>
                }
              </select>
              <button
                class="add-btn"
                (click)="onAddCollaborator()"
                [disabled]="!selectedUserId || isAdding()"
              >
                @if (isAdding()) {
                  Agregando...
                } @else {
                  Agregar
                }
              </button>
            </div>
            @if (errorMessage()) {
              <div class="error-message">{{ errorMessage() }}</div>
            }
            @if (successMessage()) {
              <div class="success-message">{{ successMessage() }}</div>
            }
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-close" (click)="onClose()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }

    .modal-content {
      background-color: white;
      border-radius: 0.5rem;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.25rem;
    }

    .close-btn:hover {
      background-color: #f3f4f6;
      color: #111827;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .section {
      margin-bottom: 1.5rem;
    }

    .section h3 {
      margin: 0 0 1rem 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: #374151;
    }

    .empty-text {
      color: #9ca3af;
      font-size: 0.875rem;
      margin: 0;
    }

    .collaborators-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .collaborator-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
    }

    .collab-info {
      flex: 1;
    }

    .collab-name {
      font-weight: 500;
      color: #111827;
      font-size: 0.95rem;
    }

    .collab-email {
      font-size: 0.85rem;
      color: #6b7280;
    }

    .collab-role {
      font-size: 0.75rem;
      color: #9ca3af;
      text-transform: uppercase;
      margin-top: 0.25rem;
    }

    .remove-btn {
      padding: 0.5rem 0.75rem;
      background-color: #ef4444;
      color: white;
      border: none;
      border-radius: 0.25rem;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .remove-btn:hover:not(:disabled) {
      background-color: #dc2626;
    }

    .remove-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .add-form {
      display: flex;
      gap: 0.75rem;
    }

    .user-select {
      flex: 1;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.95rem;
      font-family: inherit;
    }

    .user-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .add-btn {
      padding: 0.75rem 1rem;
      background-color: #10b981;
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
      white-space: nowrap;
    }

    .add-btn:hover:not(:disabled) {
      background-color: #059669;
    }

    .add-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .error-message {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background-color: #fee2e2;
      color: #991b1b;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    .success-message {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background-color: #dcfce7;
      color: #166534;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
    }

    .btn-close {
      padding: 0.75rem 1.5rem;
      background-color: #6b7280;
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-close:hover {
      background-color: #4b5563;
    }
  `],
})
export class PolicyCollaboratorsModalComponent {
  readonly collaborators = input<PolicyCollaborator[]>([]);
  readonly policyId = input.required<string>();
  readonly userId = input.required<string>();
  readonly closed = output<void>();
  readonly collaboratorsAdded = output<PolicyCollaborator[]>();

  private readonly adminService = inject(AdminService);

  readonly users = signal<User[]>([]);
  selectedUserId = '';
  readonly isAdding = signal(false);
  readonly isRemoving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly availableUsers = computed(() => {
    const existingIds = new Set(this.collaborators().map((c) => c.user_id));
    return this.users().filter((u) => !existingIds.has(u.id) && u.id !== this.userId());
  });

  constructor() {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.adminService.getUsers().subscribe({
      next: (users) => this.users.set(users),
      error: () => (this.errorMessage.set('Error cargando usuarios')),
    });
  }

  canRemove(collaborator: PolicyCollaborator): boolean {
    return collaborator.role !== 'owner';
  }

  onAddCollaborator(): void {
    if (!this.selectedUserId) {
      return;
    }

    this.isAdding.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.adminService
      .addPolicyCollaborator(this.policyId(), { user_id: this.selectedUserId })
      .subscribe({
        next: (collaborators) => {
          this.collaboratorsAdded.emit(collaborators);
          this.selectedUserId = '';
          this.successMessage.set('Colaborador agregado exitosamente');
          setTimeout(() => this.successMessage.set(''), 3000);
        },
        error: (error) => {
          this.errorMessage.set(error?.error?.detail ?? 'Error al agregar colaborador');
        },
        complete: () => this.isAdding.set(false),
      });
  }

  onRemoveCollaborator(userId: string): void {
    this.isRemoving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.adminService
      .removePolicyCollaborator(this.policyId(), userId)
      .subscribe({
        next: () => {
          this.adminService.listPolicyCollaborators(this.policyId()).subscribe({
            next: (collaborators) => {
              this.collaboratorsAdded.emit(collaborators);
              this.successMessage.set('Colaborador removido exitosamente');
              setTimeout(() => this.successMessage.set(''), 3000);
            },
          });
        },
        error: (error) => {
          this.errorMessage.set(error?.error?.detail ?? 'Error al remover colaborador');
        },
        complete: () => this.isRemoving.set(false),
      });
  }

  onClose(): void {
    this.closed.emit();
  }
}
