const FALLBACK_LABELS: Record<string, string> = {
  case_code: 'Código de caso',
  policy_name: 'Política',
  status: 'Estado',
  current_department_name: 'Departamento',
  requester_name: 'Solicitante',
  duration_hours: 'Duración (h)',
  risk_level: 'Riesgo',
  started_at: 'Inicio',
  name: 'Nombre',
  created_by_name: 'Creado por',
  scope: 'Alcance',
  uploaded_by_name: 'Subido por',
  uploaded_by_role: 'Rol',
  department_name: 'Departamento',
  versions_count: 'Versiones',
  signed_status: 'Estado de firma',
  created_at: 'Fecha',
  task_name: 'Tarea',
  assigned_user_name: 'Asignado a',
  priority: 'Prioridad',
  full_name: 'Nombre completo',
  email: 'Correo',
  is_active: 'Activo',
  user_email: 'Usuario',
  action: 'Acción',
  resource: 'Recurso',
  cantidad: 'Cantidad',
};

const DATE_COLUMNS = new Set(['created_at', 'started_at', 'published_at', 'updated_at']);
const BADGE_COLUMNS = new Set(['signed_status', 'status', 'scope', 'risk_level', 'priority']);

export function columnLabel(column: string, labels?: Record<string, string>): string {
  return labels?.[column] ?? FALLBACK_LABELS[column] ?? column.replaceAll('_', ' ');
}

export function isDateColumn(column: string): boolean {
  return DATE_COLUMNS.has(column);
}

export function isBadgeColumn(column: string): boolean {
  return BADGE_COLUMNS.has(column);
}

export function formatFilterLabel(key: string, value: unknown): string {
  const friendlyKeys: Record<string, string> = {
    created_by_name: 'Autor',
    created_by_email: 'Correo del autor',
    date_range: 'Fechas',
    status: 'Estado',
    category: 'Categoría',
  };
  const label = friendlyKeys[key] ?? key;
  if (key === 'date_range' && value && typeof value === 'object') {
    const range = value as Record<string, unknown>;
    const rangeLabel = range['label'];
    if (typeof rangeLabel === 'string' && rangeLabel) {
      return `${label}: ${rangeLabel.replaceAll('_', ' ')}`;
    }
    return 'Rango de fechas aplicado';
  }
  if (key === 'created_by_name' || key === 'created_by_email') {
    return `${label}: ${String(value)}`;
  }
  if (typeof value === 'boolean') {
    return `${key}: ${value ? 'sí' : 'no'}`;
  }
  if (value === null || value === undefined) {
    return key;
  }
  return `${key}: ${String(value)}`;
}

export function badgeClass(column: string, value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (column === 'signed_status') {
    return normalized === 'firmado' ? 'badge badge--success' : 'badge badge--muted';
  }
  if (column === 'status') {
    if (['completed', 'published', 'active'].includes(normalized)) return 'badge badge--success';
    if (['blocked', 'rejected', 'draft'].includes(normalized)) return 'badge badge--danger';
    return 'badge badge--info';
  }
  if (column === 'risk_level') {
    if (normalized === 'alto') return 'badge badge--danger';
    if (normalized === 'medio') return 'badge badge--warning';
    return 'badge badge--muted';
  }
  return 'badge badge--muted';
}
