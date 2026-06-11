export type PolicyNodeType = 'initial' | 'activity' | 'decision' | 'fork' | 'join' | 'final';

export interface PolicyLane {
  id: string;
  department_id: string;
  department_name: string;
}

export interface PolicyNode {
  id: string;
  type: PolicyNodeType;
  label: string;
  lane_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
}

export interface PolicyEdge {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  metadata: Record<string, unknown>;
}

export type PolicyFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'time'
  | 'datetime'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multiselect'
  | 'file';

export interface PolicyFormFieldValidation {
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  step: number | null;
  pattern: string | null;
  pattern_message: string | null;
  min_date: string | null;
  max_date: string | null;
  accept: string[];
  rows: number | null;
  min_selections: number | null;
  max_selections: number | null;
  default_value: string | boolean | number | string[] | null;
}

export interface PolicyFormField {
  id: string;
  name: string;
  label: string;
  type: PolicyFormFieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
  help_text: string | null;
  validation: PolicyFormFieldValidation;
  metadata: Record<string, unknown>;
}

export interface PolicyForm {
  id: string;
  name: string;
  description: string;
  activity_id: string | null;
  fields: PolicyFormField[];
  created_at: string;
  updated_at: string;
}

export interface PolicyDiagram {
  notation: string;
  uml_version: string;
  lanes: PolicyLane[];
  nodes: PolicyNode[];
  edges: PolicyEdge[];
  forms: PolicyForm[];
  metadata: Record<string, unknown>;
  source_xml: string | null;
}

export interface PolicyCollaborator {
  user_id: string;
  user_email: string;
  user_name: string;
  role: 'owner' | 'editor';
  invited_at: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  created_by: string;
  created_by_name: string;
  collaborators: PolicyCollaborator[];
  company_shared?: boolean;
  diagram: PolicyDiagram;
  created_at: string;
  updated_at: string;
}

export interface PolicyDraftCreate {
  name: string;
  description: string;
  category: string;
}

export interface PolicyFormCreate {
  name: string;
  description: string;
  activity_id: string | null;
  fields: PolicyFormField[];
}

export interface AIPolicyGenerateResponse {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  domain_id: string;
  flow_type: string;
  interpreter: string;
  diagram: PolicyDiagram;
  created_at: string;
  transcribed_text: string | null;
}
