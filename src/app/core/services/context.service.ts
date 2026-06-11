import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

export interface PageContext {
  route: string;
  page_category: string;
  page_title: string;
  relevant_ids: Record<string, string>;
}

const ROUTE_MAP: Record<string, { category: string; title: string }> = {
  '/panel/control': { category: 'dashboard', title: 'Panel de Control' },
  '/panel/usuarios': { category: 'users', title: 'Gestión de Usuarios' },
  '/panel/funcionarios': { category: 'users', title: 'Funcionarios' },
  '/panel/roles': { category: 'roles', title: 'Roles y Permisos' },
  '/panel/departamentos': { category: 'departments', title: 'Departamentos' },
  '/panel/politicas': { category: 'policies_list', title: 'Políticas de Negocio' },
  '/panel/reportes-ia': { category: 'reports', title: 'Reportes IA' },
  '/panel/anomalias': { category: 'anomalies', title: 'Anomalías' },
  '/panel/auditoria': { category: 'audit', title: 'Auditoría' },
  '/panel/cuellos-botella': { category: 'bottlenecks', title: 'Cuellos de Botella' },
  '/panel/documentos': { category: 'global_documents', title: 'Documentos' },
  '/workflow/panel': { category: 'dashboard', title: 'Panel de Trabajo' },
  '/workflow/bandeja': { category: 'inbox', title: 'Bandeja de Tareas' },
  '/workflow/tramites': { category: 'workflow_cases', title: 'Mis Trámites' },
  '/workflow/seguimiento': { category: 'following', title: 'Seguimiento' },
  '/workflow/catalogo': { category: 'catalog', title: 'Catálogo de Políticas' },
  '/workflow/documentos-global': { category: 'global_documents', title: 'Documentos' },
};

const SUGGESTIONS: Record<string, string> = {
  dashboard: 'Bienvenido al panel. ¿Querés ver un resumen de trámites activos o generar un reporte?',
  users: 'Estás gestionando usuarios. ¿Necesitás crear uno nuevo, asignar roles o cambiar departamentos?',
  roles: 'Estás configurando roles. ¿Querés ver qué permisos tiene cada rol o crear uno nuevo?',
  departments: '¿Necesitás crear un nuevo departamento o ver la estructura organizacional?',
  policies_list: '¿Querés crear una nueva política? Puedo generar el diagrama automáticamente con IA.',
  policy_editor: '¿Necesitás ayuda con el diagrama de actividades? Puedo sugerirte nodos, calles o formularios.',
  reports: 'Escribí tu consulta en lenguaje natural y yo genero el reporte. Ej: "trámites por departamento en mayo".',
  anomalies: 'Estás viendo anomalías del sistema. ¿Querés ejecutar una detección o filtrar por severidad?',
  bottlenecks: '¿Necesitás identificar qué departamentos tienen mayor carga o qué actividades están demorando?',
  audit: 'Estás en auditoría. ¿Querés buscar acciones por usuario, fecha o tipo de recurso?',
  global_documents: 'Estás viendo el repositorio global. ¿Necesitás buscar un documento o subir uno nuevo?',
  inbox: 'Tenés tareas pendientes en la bandeja. ¿Querés que te ayude a priorizar o reclamar una?',
  task: 'Estás trabajando en una actividad. ¿Necesitás ayuda con el formulario o querés derivar el trámite?',
  workflow_cases: '¿Querés generar un reporte de tus trámites? Pedímelo en lenguaje natural.',
  following: 'Estás en seguimiento de trámites. ¿Querés consultar el estado de alguno en particular?',
  catalog: '¿Necesitás iniciar un trámite? Puedo guiarte en el proceso y elegir la política correcta.',
  document_repository: '¿Necesitás organizar documentos, subir una versión, firmar o comparar versiones?',
  document_editor: 'Estás editando un documento. Guardá con Ctrl+S. ¿Necesitás ayuda con el formato?',
  document_preview: '¿Querés descargar este documento, editarlo, firmarlo o compartirlo?',
  workflow_case_detail: 'Estás viendo un trámite. ¿Necesitás ver sus documentos, el historial o derivarlo?',
};

const SUGGESTION_DELAY_MS = 15_000;
const INTERACTION_COOLDOWN_MS = 120_000;

function extractPageInfo(url: string): { category: string; title: string; ids: Record<string, string> } {
  const cleanUrl = url.split('?')[0].split('#')[0];

  if (cleanUrl.includes('/politicas/') && cleanUrl.includes('/editor')) {
    const id = cleanUrl.split('/politicas/')[1]?.split('/')[0] ?? '';
    return { category: 'policy_editor', title: 'Editor de Política', ids: { policy_id: id } };
  }

  const taskIdMatch = cleanUrl.match(/\/bandeja\/([^/]+)\/repositorio/);
  if (taskIdMatch) {
    return { category: 'document_repository', title: 'Repositorio Documental', ids: { task_id: taskIdMatch[1] } };
  }

  const instanceRepoMatch = cleanUrl.match(/\/tramites\/([^/]+)\/repositorio/);
  if (instanceRepoMatch) {
    return { category: 'document_repository', title: 'Repositorio Documental', ids: { instance_id: instanceRepoMatch[1] } };
  }

  const taskIdMatch2 = cleanUrl.match(/\/bandeja\/([^/]+)$/);
  if (taskIdMatch2) {
    return { category: 'task', title: 'Actividad', ids: { task_id: taskIdMatch2[1] } };
  }

  const docEditMatch = cleanUrl.match(/\/documentos\/([^/]+)\/editar/);
  if (docEditMatch) {
    return { category: 'document_editor', title: 'Editor de Documento', ids: { document_id: docEditMatch[1] } };
  }

  const docViewMatch = cleanUrl.match(/\/documentos\/([^/]+)\/vista/);
  if (docViewMatch) {
    return { category: 'document_preview', title: 'Vista Previa de Documento', ids: { document_id: docViewMatch[1] } };
  }

  const instanceMatch = cleanUrl.match(/\/tramites\/([^/]+)/);
  if (instanceMatch) {
    return { category: 'workflow_case_detail', title: 'Detalle de Trámite', ids: { instance_id: instanceMatch[1] } };
  }

  const exact = ROUTE_MAP[cleanUrl];
  if (exact) {
    return { category: exact.category, title: exact.title, ids: {} };
  }

  for (const [route, info] of Object.entries(ROUTE_MAP)) {
    if (cleanUrl.startsWith(route) && route !== '/panel/politicas') {
      return { category: info.category, title: info.title, ids: {} };
    }
  }

  return { category: 'unknown', title: 'Sistema', ids: {} };
}

@Injectable({ providedIn: 'root' })
export class ContextService implements OnDestroy {
  private readonly router = inject(Router);
  private suggestionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dismissedKeys = new Set<string>();
  private lastInteractionTime = 0;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ).pipe(
      filter((event) => event.urlAfterRedirects !== event.url || !event.url.includes('?')),
      map((event) => event.urlAfterRedirects || event.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly parsed = computed(() => extractPageInfo(this.currentUrl()));

  readonly currentContext = computed<PageContext>(() => {
    const info = this.parsed();
    return {
      route: this.currentUrl(),
      page_category: info.category,
      page_title: info.title,
      relevant_ids: info.ids,
    };
  });

  readonly pageCategory = computed(() => this.parsed().category);
  readonly pageTitle = computed(() => this.parsed().title);
  readonly pendingSuggestions = signal<string[]>([]);

  constructor() {
    this.startUrlWatcher();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  dismissCurrentSuggestions(): void {
    const current = this.pendingSuggestions();
    for (const s of current) {
      this.dismissedKeys.add(`${this.pageCategory()}|${s}`);
    }
    this.pendingSuggestions.set([]);
    this.lastInteractionTime = Date.now();
  }

  recordInteraction(): void {
    this.lastInteractionTime = Date.now();
  }

  getProactiveSuggestion(): string | null {
    const cat = this.pageCategory();
    return SUGGESTIONS[cat] ?? null;
  }

  private startUrlWatcher(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.clearTimer();
        this.pendingSuggestions.set([]);
        this.scheduleSuggestion();
      });
    this.scheduleSuggestion();
  }

  private scheduleSuggestion(): void {
    const cat = this.pageCategory();
    const suggestion = SUGGESTIONS[cat];
    if (!suggestion || cat === 'unknown') return;

    const key = `${cat}|${suggestion}`;
    if (this.dismissedKeys.has(key)) return;
    if (Date.now() - this.lastInteractionTime < INTERACTION_COOLDOWN_MS) return;

    this.suggestionTimer = setTimeout(() => {
      this.suggestionTimer = null;
      if (Date.now() - this.lastInteractionTime < INTERACTION_COOLDOWN_MS) return;
      if (this.dismissedKeys.has(key)) return;
      const currentCat = this.pageCategory();
      if (currentCat === cat) {
        this.pendingSuggestions.set([suggestion]);
      }
    }, SUGGESTION_DELAY_MS);
  }

  private clearTimer(): void {
    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }
  }
}
