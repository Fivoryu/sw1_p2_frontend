import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ChatWidgetComponent } from '../shared/components/chat/chat-widget.component';
import { AiAssistantWidgetComponent } from '../shared/components/assistant/assistant-widget.component';
import { WorkflowRealtimeService } from '../core/services/workflow-realtime.service';
import { WorkflowService } from '../core/services/workflow.service';
import {
  SidebarNavIconComponent,
  SidebarNavIconName,
} from '../shared/components/sidebar-nav-icon.component';

type WorkflowNavItem = {
  route: string;
  label: string;
  icon: SidebarNavIconName;
};

@Component({
  selector: 'app-funcionario-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SidebarNavIconComponent, ChatWidgetComponent, AiAssistantWidgetComponent],
  templateUrl: './funcionario-shell.component.html',
  styleUrl: './funcionario-shell.component.scss',
})
export class FuncionarioShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workflowRealtime = inject(WorkflowRealtimeService);
  private readonly workflowService = inject(WorkflowService);

  readonly sidebarCollapsed = signal(this.readSidebarCollapsed());
  readonly currentUser = this.authService.getCurrentUser();
  readonly realtimeConnected = this.workflowRealtime.isConnected;
  readonly navigation = computed<WorkflowNavItem[]>(() => {
    if (this.authService.isClienteRole()) {
      return [{ route: '/workflow/seguimiento', label: 'Seguimiento del Trámite', icon: 'cases' }];
    }

    return [
      { route: '/workflow/panel', label: 'Mi Panel de Trabajo', icon: 'dashboard' },
      { route: '/workflow/bandeja', label: 'Bandeja', icon: 'inbox' },
      { route: '/workflow/tramites', label: 'Mis trámites', icon: 'cases' },
      { route: '/workflow/seguimiento', label: 'Seguimiento', icon: 'cases' },
      { route: '/workflow/catalogo', label: 'Catálogo', icon: 'catalog' },
      { route: '/workflow/documentos-global', label: 'Documentos', icon: 'policies' },
    ];
  });
  readonly greeting = computed(() => {
    const firstName = this.currentUser?.full_name.split(' ')[0] ?? 'Funcionario';
    return `Hola, ${firstName}`;
  });

  constructor() {
    effect(() => {
      const user = this.authService.getCurrentUser();
      if (!user || !(this.authService.isFuncionarioRole() || this.authService.isClienteRole())) {
        return;
      }
      this.workflowRealtime.connect(user.id, user.department_id);
    });

    effect(() => {
      const event = this.workflowRealtime.lastEvent();
      if (!event) {
        return;
      }
      if (event.type.startsWith('workflow.task.') || event.type.startsWith('workflow.document.')) {
        this.workflowService.refreshAll();
      }
    });

    this.destroyRef.onDestroy(() => this.workflowRealtime.disconnect());
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => {
      const next = !value;
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('workflowSidebarCollapsed', next ? '1' : '0');
      }
      return next;
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  userInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return '?';
    }
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private readSidebarCollapsed(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return localStorage.getItem('workflowSidebarCollapsed') === '1';
  }
}
