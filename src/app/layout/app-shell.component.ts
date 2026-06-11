import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ChatWidgetComponent } from '../shared/components/chat/chat-widget.component';
import { AiAssistantWidgetComponent } from '../shared/components/assistant/assistant-widget.component';
import {
  SidebarNavIconComponent,
  SidebarNavIconName,
} from '../shared/components/sidebar-nav-icon.component';

type AdminNavItem = {
  route: string;
  label: string;
  icon: SidebarNavIconName;
};

type AdminNavGroup = {
  label?: string;
  items: AdminNavItem[];
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SidebarNavIconComponent, ChatWidgetComponent, AiAssistantWidgetComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly sidebarCollapsed = signal(this.readSidebarCollapsed());
  readonly navigationGroups = computed<AdminNavGroup[]>(() => {
    const administration: AdminNavItem[] = [
      { route: '/panel/control', label: 'Panel de Control', icon: 'dashboard' },
      { route: '/panel/usuarios', label: 'Usuarios', icon: 'users' },
      { route: '/panel/funcionarios', label: 'Funcionarios', icon: 'funcionarios' },
      { route: '/panel/roles', label: 'Roles', icon: 'roles' },
      { route: '/panel/departamentos', label: 'Departamentos', icon: 'departments' },
      { route: '/panel/politicas', label: 'Políticas', icon: 'policies' },
    ];

    if (this.authService.canAccessAuditPanel()) {
      administration.splice(1, 0, { route: '/panel/auditoria', label: 'Auditoría', icon: 'audit' });
    }

    if (this.authService.canReadDocuments()) {
      administration.push({ route: '/panel/documentos', label: 'Documentos', icon: 'policies' });
    }

    const ai: AdminNavItem[] = [];
    if (this.authService.canUseAiReports()) {
      ai.push({ route: '/panel/reportes-ia', label: 'Reportes IA', icon: 'reports' });
    }
    if (this.authService.canUseAi()) {
      ai.push({ route: '/panel/anomalias', label: 'Anomalías', icon: 'anomalies' });
      ai.push({ route: '/panel/cuellos-botella', label: 'Cuellos de Botella', icon: 'bottleneck' });
    }

    const groups: AdminNavGroup[] = [{ label: 'Administración', items: administration }];
    if (ai.length) {
      groups.push({ label: 'IA operacional', items: ai });
    }
    return groups;
  });

  currentUser = this.authService.getCurrentUser();
  canWrite = computed(() => this.authService.canWriteAdminData());

  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => {
      const next = !value;
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
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
    return localStorage.getItem('sidebarCollapsed') === '1';
  }
}
