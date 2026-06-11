import { PolicyFormField, PolicyFormFieldType, PolicyFormFieldValidation } from './policy.models';
import { WorkflowTaskForm, WorkflowTaskFormField } from './workflow.models';

export interface PolicyFormFieldTypeOption {
  value: PolicyFormFieldType;
  label: string;
  group: string;
  description: string;
  inputType: string;
}

export const POLICY_FORM_FIELD_TYPE_OPTIONS: PolicyFormFieldTypeOption[] = [
  { value: 'text', label: 'Texto corto', group: 'Texto', description: 'Entrada de una línea para nombres, códigos o referencias.', inputType: 'text' },
  { value: 'textarea', label: 'Texto largo', group: 'Texto', description: 'Área multilínea para observaciones, justificaciones o detalle.', inputType: 'textarea' },
  { value: 'email', label: 'Correo electrónico', group: 'Texto', description: 'Dirección de email con validación de formato.', inputType: 'email' },
  { value: 'phone', label: 'Teléfono', group: 'Texto', description: 'Número telefónico o celular.', inputType: 'tel' },
  { value: 'url', label: 'URL', group: 'Texto', description: 'Enlace web o recurso externo.', inputType: 'url' },
  { value: 'number', label: 'Número', group: 'Numérico', description: 'Valores enteros o decimales con rango opcional.', inputType: 'number' },
  { value: 'date', label: 'Fecha', group: 'Fecha y hora', description: 'Selector de fecha calendario.', inputType: 'date' },
  { value: 'time', label: 'Hora', group: 'Fecha y hora', description: 'Selector de hora del día.', inputType: 'time' },
  { value: 'datetime', label: 'Fecha y hora', group: 'Fecha y hora', description: 'Marca temporal combinada.', inputType: 'datetime-local' },
  { value: 'select', label: 'Desplegable', group: 'Selección', description: 'El usuario elige una sola opción.', inputType: 'select' },
  { value: 'radio', label: 'Una opción', group: 'Selección', description: 'Opciones visibles; solo se elige una.', inputType: 'radio' },
  { value: 'multiselect', label: 'Varias opciones', group: 'Selección', description: 'El usuario puede marcar más de una.', inputType: 'multiselect' },
  { value: 'checkbox', label: 'Casilla de verificación', group: 'Selección', description: 'Valor booleano sí/no.', inputType: 'checkbox' },
  { value: 'file', label: 'Archivo referencial', group: 'Archivos', description: 'Referencia a documento adjunto.', inputType: 'file' },
];

export const OPTION_FIELD_TYPES = new Set<PolicyFormFieldType>(['select', 'radio', 'multiselect']);
export const TEXT_LIKE_FIELD_TYPES = new Set<PolicyFormFieldType>(['text', 'textarea', 'email', 'phone', 'url']);
export const NUMERIC_FIELD_TYPES = new Set<PolicyFormFieldType>(['number']);
export const TEMPORAL_FIELD_TYPES = new Set<PolicyFormFieldType>(['date', 'time', 'datetime']);

const DEFAULT_OPTIONS_BY_NAME: Record<string, string[]> = {
  aprobacion: ['Si', 'No'],
  conforme_legal: ['Si', 'No'],
  conformidad: ['Si', 'No'],
  completo: ['Si', 'No'],
  cumple_politica: ['Si', 'No'],
  decision: ['Aprobar', 'Observar'],
  disponibilidad: ['Disponible', 'Insuficiente'],
  medio_pago: ['Transferencia', 'Cheque'],
  orden_compra: ['Adjunta', 'No adjunta'],
  prioridad: ['Baja', 'Media', 'Alta', 'Critica'],
  requiere_ajuste: ['Si', 'No'],
  requiere_escalado: ['Si', 'No'],
  riesgo: ['Alto', 'Medio', 'Bajo'],
  tipo: ['Interno', 'Externo', 'Mixto'],
  tipo_danio: ['Electrico', 'Sanitario', 'Civil', 'Otro'],
  urgencia: ['Alta', 'Media', 'Baja'],
  criticidad: ['Alta', 'Media', 'Baja'],
};

export function createEmptyFieldValidation(): PolicyFormFieldValidation {
  return {
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    step: null,
    pattern: null,
    pattern_message: null,
    min_date: null,
    max_date: null,
    accept: [],
    rows: null,
    min_selections: null,
    max_selections: null,
    default_value: null,
  };
}

export function createEmptyPolicyFormField(type: PolicyFormFieldType = 'text'): PolicyFormField {
  return {
    id: `field-${crypto.randomUUID()}`,
    name: '',
    label: '',
    type,
    required: false,
    options: [],
    placeholder: null,
    help_text: null,
    validation: createEmptyFieldValidation(),
    metadata: {},
  };
}

export function normalizePolicyFormField(field: PolicyFormField): PolicyFormField {
  const validation = {
    ...createEmptyFieldValidation(),
    ...(field.validation ?? {}),
    accept: [...(field.validation?.accept ?? [])],
  };

  return {
    ...field,
    name: slugifyFieldName(field.name || field.label),
    label: field.label.trim(),
    placeholder: field.placeholder?.trim() || null,
    help_text: field.help_text?.trim() || null,
    options: OPTION_FIELD_TYPES.has(field.type) ? field.options.map((option) => option.trim()).filter(Boolean) : [],
    validation,
  };
}

export function slugifyFieldName(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!normalized) {
    return '';
  }

  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`;
}

export function fieldTypeLabel(type: PolicyFormFieldType): string {
  return POLICY_FORM_FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function fieldTypeDescription(type: PolicyFormFieldType): string {
  return POLICY_FORM_FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.description ?? '';
}

export function fieldTypeInputType(type: PolicyFormFieldType): string {
  return POLICY_FORM_FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.inputType ?? 'text';
}

export function fieldTypeNeedsOptions(type: PolicyFormFieldType): boolean {
  return OPTION_FIELD_TYPES.has(type);
}

export function fieldOptionsEditorTitle(type: PolicyFormFieldType): string {
  if (type === 'select') return 'Opciones de la lista desplegable';
  if (type === 'multiselect') return 'Opciones de selección múltiple';
  return 'Opciones disponibles';
}

export function fieldOptionsEditorHint(type: PolicyFormFieldType): string {
  if (type === 'select') return 'El funcionario verá estas opciones en un menú desplegable.';
  if (type === 'multiselect') return 'El funcionario podrá marcar una o más de estas opciones.';
  return 'El funcionario elegirá una sola opción visible.';
}

export function fieldTypeSupportsTextValidation(type: PolicyFormFieldType): boolean {
  return TEXT_LIKE_FIELD_TYPES.has(type);
}

export function fieldTypeSupportsNumericValidation(type: PolicyFormFieldType): boolean {
  return NUMERIC_FIELD_TYPES.has(type);
}

export function fieldTypeSupportsTemporalValidation(type: PolicyFormFieldType): boolean {
  return TEMPORAL_FIELD_TYPES.has(type);
}

export function fieldTypeSupportsFileValidation(type: PolicyFormFieldType): boolean {
  return type === 'file';
}

export function fieldTypeSupportsRows(type: PolicyFormFieldType): boolean {
  return type === 'textarea';
}

export function fieldTypeSupportsSelectionValidation(type: PolicyFormFieldType): boolean {
  return type === 'multiselect';
}

export function fieldTypeSupportsDefaultValue(type: PolicyFormFieldType): boolean {
  return type !== 'file';
}

export function fieldTypeGroups(): string[] {
  return [...new Set(POLICY_FORM_FIELD_TYPE_OPTIONS.map((option) => option.group))];
}

export function fieldTypesByGroup(group: string): PolicyFormFieldTypeOption[] {
  return POLICY_FORM_FIELD_TYPE_OPTIONS.filter((option) => option.group === group);
}

export function validatePolicyFormFields(fields: PolicyFormField[]): string | null {
  if (!fields.length) {
    return 'Debes crear al menos un campo.';
  }

  const names = new Set<string>();
  for (const field of fields) {
    const normalized = normalizePolicyFormField(field);

    if (!normalized.label) {
      return 'Cada pregunta debe tener un texto.';
    }

    if (!normalized.name || !/^[a-z][a-z0-9_]*$/.test(normalized.name)) {
      return `No se pudo generar el identificador para "${normalized.label}". Usa letras o números en la pregunta.`;
    }

    if (names.has(normalized.name)) {
      return `El nombre técnico "${normalized.name}" está duplicado.`;
    }
    names.add(normalized.name);

    if (fieldTypeNeedsOptions(normalized.type) && !normalized.options.length) {
      return `El campo "${normalized.label}" requiere al menos una opción.`;
    }

    const validation = normalized.validation;
    if (validation.min_length != null && validation.max_length != null && validation.min_length > validation.max_length) {
      return `El campo "${normalized.label}" tiene longitudes inválidas.`;
    }

    if (validation.min_value != null && validation.max_value != null && validation.min_value > validation.max_value) {
      return `El campo "${normalized.label}" tiene rangos numéricos inválidos.`;
    }

    if (validation.min_selections != null && validation.max_selections != null && validation.min_selections > validation.max_selections) {
      return `El campo "${normalized.label}" tiene selecciones inválidas.`;
    }
  }

  return null;
}

export function serializePolicyFormFields(fields: PolicyFormField[]): PolicyFormField[] {
  return fields.map((field) => {
    const normalized = normalizePolicyFormField(field);
    return {
      ...normalized,
      options: fieldTypeNeedsOptions(normalized.type) ? normalized.options : [],
      validation: {
        ...normalized.validation,
        accept: fieldTypeSupportsFileValidation(normalized.type) ? normalized.validation.accept : [],
        rows: fieldTypeSupportsRows(normalized.type) ? normalized.validation.rows : null,
        min_length: fieldTypeSupportsTextValidation(normalized.type) ? normalized.validation.min_length : null,
        max_length: fieldTypeSupportsTextValidation(normalized.type) ? normalized.validation.max_length : null,
        pattern: fieldTypeSupportsTextValidation(normalized.type) ? normalized.validation.pattern : null,
        pattern_message: fieldTypeSupportsTextValidation(normalized.type) ? normalized.validation.pattern_message : null,
        min_value: fieldTypeSupportsNumericValidation(normalized.type) ? normalized.validation.min_value : null,
        max_value: fieldTypeSupportsNumericValidation(normalized.type) ? normalized.validation.max_value : null,
        step: fieldTypeSupportsNumericValidation(normalized.type) ? normalized.validation.step : null,
        min_date: fieldTypeSupportsTemporalValidation(normalized.type) ? normalized.validation.min_date : null,
        max_date: fieldTypeSupportsTemporalValidation(normalized.type) ? normalized.validation.max_date : null,
        min_selections: fieldTypeSupportsSelectionValidation(normalized.type) ? normalized.validation.min_selections : null,
        max_selections: fieldTypeSupportsSelectionValidation(normalized.type) ? normalized.validation.max_selections : null,
        default_value: fieldTypeSupportsDefaultValue(normalized.type) ? normalized.validation.default_value : null,
      },
    };
  });
}

export function hydratePolicyFormField(field: PolicyFormField): PolicyFormField {
  return normalizePolicyFormField({
    ...createEmptyPolicyFormField(field.type),
    ...field,
    validation: {
      ...createEmptyFieldValidation(),
      ...(field.validation ?? {}),
    },
  });
}

export function humanizeFieldName(name: string): string {
  const cleaned = name.replace(/_/g, ' ').trim();
  if (!cleaned) {
    return 'Campo';
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function coercePolicyFormOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const options: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let value = '';
    if (typeof item === 'string') {
      value = item.trim();
    } else if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      for (const key of ['label', 'value', 'name']) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          value = candidate.trim();
          break;
        }
      }
    } else if (item != null) {
      value = String(item).trim();
    }

    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    options.push(value);
  }
  return options;
}

export function hydrateWorkflowTaskFormField(field: WorkflowTaskFormField): WorkflowTaskFormField {
  const hydrated = hydratePolicyFormField({
    ...field,
    type: field.type as PolicyFormFieldType,
  });
  let options = coercePolicyFormOptions(hydrated.options);
  if (fieldTypeNeedsOptions(hydrated.type) && !options.length) {
    options = [...(DEFAULT_OPTIONS_BY_NAME[hydrated.name] ?? [])];
  }

  const label = hydrated.label.trim() || humanizeFieldName(hydrated.name);
  return {
    ...field,
    ...hydrated,
    type: field.type,
    label,
    options,
  };
}

export function hydrateWorkflowTaskForm(form: WorkflowTaskForm | null): WorkflowTaskForm | null {
  if (!form) {
    return null;
  }

  return {
    ...form,
    fields: form.fields.map((field) => hydrateWorkflowTaskFormField(field)),
  };
}
