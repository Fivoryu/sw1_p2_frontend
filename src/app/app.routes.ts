import { Routes } from '@angular/router';
import { adminPanelGuard, auditPanelGuard, authGuard, guestGuard, workflowGuard } from './core/guards/auth.guard';
import { BottlenecksPageComponent } from './features/bottlenecks/bottlenecks-page.component';
import { DepartmentsPageComponent } from './features/departments/departments-page.component';
import { LoginPageComponent } from './features/login/login-page.component';
import { PolicyEditorPageComponent } from './features/policies/policy-editor-page.component';
import { PoliciesPageComponent } from './features/policies/policies-page.component';
import { RolesPageComponent } from './features/roles/roles-page.component';
import { UsersPageComponent } from './features/users/users-page.component';
import { AppShellComponent } from './layout/app-shell.component';
import { FuncionarioShellComponent } from './layout/funcionario-shell.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [guestGuard],
  },
  {
    path: 'panel',
    component: AppShellComponent,
    canActivate: [authGuard, adminPanelGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'control' },
      { path: 'usuarios', component: UsersPageComponent },
      {
        path: 'funcionarios',
        loadComponent: () =>
          import('./features/funcionarios/funcionarios-page.component').then((m) => m.FuncionariosPageComponent),
      },
      { path: 'roles', component: RolesPageComponent },
      { path: 'departamentos', component: DepartmentsPageComponent },
      { path: 'politicas', component: PoliciesPageComponent },
      { path: 'politicas/:id/editor', component: PolicyEditorPageComponent },
      {
        path: 'control',
        loadComponent: () =>
          import('./features/dashboard/panel-control-page.component').then((m) => m.PanelControlPageComponent),
      },
      {
        path: 'auditoria',
        canActivate: [auditPanelGuard],
        loadComponent: () =>
          import('./features/audit/audit-page.component').then((m) => m.AuditPageComponent),
      },
      {
        path: 'reportes-ia',
        loadComponent: () =>
          import('./features/reports/ai-reports-page.component').then((m) => m.AiReportsPageComponent),
      },
      {
        path: 'anomalias',
        loadComponent: () =>
          import('./features/anomalies/anomalies-page.component').then((m) => m.AnomaliesPageComponent),
      },
      { path: 'cuellos-botella', component: BottlenecksPageComponent },
      {
        path: 'documentos',
        loadComponent: () =>
          import('./features/documents/documentos-page.component').then((m) => m.DocumentosPageComponent),
      },
      {
        path: 'documentos/:documentId/vista',
        loadComponent: () =>
          import('./features/workflow/workflow-document-preview-page.component').then(
            (m) => m.WorkflowDocumentPreviewPageComponent,
          ),
      },
      {
        path: 'documentos/:documentId/editar',
        loadComponent: () =>
          import('./features/workflow/workflow-document-editor-page.component').then(
            (m) => m.WorkflowDocumentEditorPageComponent,
          ),
      },
    ],
  },
  {
    path: 'workflow',
    component: FuncionarioShellComponent,
    canActivate: [authGuard, workflowGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'panel' },
      {
        path: 'panel',
        loadComponent: () =>
          import('./features/dashboard/panel-control-page.component').then((m) => m.PanelControlPageComponent),
      },
      {
        path: 'seguimiento',
        loadComponent: () =>
          import('./features/workflow/workflow-following-page.component').then((m) => m.WorkflowFollowingPageComponent),
      },
      {
        path: 'bandeja',
        loadComponent: () =>
          import('./features/workflow/workflow-inbox-page.component').then((m) => m.WorkflowInboxPageComponent),
      },
      {
        path: 'documentos/:documentId/vista',
        loadComponent: () =>
          import('./features/workflow/workflow-document-preview-page.component').then(
            (m) => m.WorkflowDocumentPreviewPageComponent,
          ),
      },
      {
        path: 'documentos/:documentId/editar',
        loadComponent: () =>
          import('./features/workflow/workflow-document-editor-page.component').then(
            (m) => m.WorkflowDocumentEditorPageComponent,
          ),
      },
      {
        path: 'bandeja/:taskId/repositorio',
        loadComponent: () =>
          import('./features/workflow/workflow-document-repository-page.component').then(
            (m) => m.WorkflowDocumentRepositoryPageComponent,
          ),
        data: { mode: 'task' },
      },
      {
        path: 'bandeja/:taskId',
        loadComponent: () =>
          import('./features/workflow/workflow-task-page.component').then((m) => m.WorkflowTaskPageComponent),
      },
      {
        path: 'tramites/:instanceId/repositorio',
        loadComponent: () =>
          import('./features/workflow/workflow-document-repository-page.component').then(
            (m) => m.WorkflowDocumentRepositoryPageComponent,
          ),
        data: { mode: 'instance' },
      },
      {
        path: 'tramites',
        loadComponent: () =>
          import('./features/workflow/workflow-cases-page.component').then((m) => m.WorkflowCasesPageComponent),
      },
      {
        path: 'catalogo',
        loadComponent: () =>
          import('./features/workflow/workflow-catalog-page.component').then((m) => m.WorkflowCatalogPageComponent),
      },
      {
        path: 'documentos-global',
        loadComponent: () =>
          import('./features/documents/documentos-page.component').then((m) => m.DocumentosPageComponent),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'panel' },
  { path: '**', redirectTo: 'panel' },
];
