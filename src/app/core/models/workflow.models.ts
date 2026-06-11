import { RouteRecommendationApi } from './ai.models';

export type WorkflowPriority = 'alta' | 'media' | 'baja';

export interface WorkflowStartResponse {
  instance: WorkflowCaseApi;
  first_task: WorkflowTaskApi;
}

export interface WorkflowTaskDetailApi {
  task: WorkflowTaskApi;
  form: WorkflowTaskForm | null;
  responses: Record<string, unknown>;
}

export interface WorkflowTaskCompleteResponse {
  completed_task: WorkflowTaskApi;
  next_task: WorkflowTaskApi | null;
  instance: WorkflowCaseApi;
}

export interface WorkflowTaskFormFieldValidation {
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

export interface WorkflowTaskFormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  placeholder: string | null;
  help_text: string | null;
  validation: WorkflowTaskFormFieldValidation;
  metadata: Record<string, unknown>;
}

export interface WorkflowTaskForm {
  id: string;
  name: string;
  description: string;
  activity_id: string | null;
  fields: WorkflowTaskFormField[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowDocumentVersionApi {
  id: string;
  version_number: number;
  storage_driver: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256?: string | null;
  change_type: string;
  comment: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export interface WorkflowDocumentApi {
  id: string;
  case_id: string;
  policy_id: string | null;
  task_id: string | null;
  activity_id: string | null;
  name: string;
  scope: string;
  current_version: number;
  is_active: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  latest_version: WorkflowDocumentVersionApi;
}

export interface WorkflowDocumentListApi {
  case_id: string;
  documents: WorkflowDocumentApi[];
}

export interface WorkflowDocumentVersionListApi {
  document_id: string;
  versions: WorkflowDocumentVersionApi[];
}

export interface WorkflowTaskDocumentListApi {
  case_id: string;
  documents: WorkflowDocumentApi[];
}

export interface WorkflowInstanceDiagramLaneApi {
  id: string;
  department_id: string;
  department_name: string;
}

export interface WorkflowInstanceDiagramNodeApi {
  id: string;
  type: string;
  label: string;
  lane_id: string | null;
}

export interface WorkflowInstanceDiagramEdgeApi {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
}

export interface WorkflowInstanceDiagramApi {
  notation: string;
  uml_version: string;
  lanes: WorkflowInstanceDiagramLaneApi[];
  nodes: WorkflowInstanceDiagramNodeApi[];
  edges: WorkflowInstanceDiagramEdgeApi[];
}

export interface WorkflowInstanceDetailApi {
  instance: WorkflowCaseApi;
  diagram: WorkflowInstanceDiagramApi;
  tasks: WorkflowTaskApi[];
  context_data?: Record<string, unknown>;
  completed_forms?: Array<Record<string, unknown>>;
}

export interface WorkflowDocumentSignatureApi {
  id: string;
  document_id: string;
  version_id: string;
  version_number: number;
  signed_hash: string;
  signature_algorithm: string;
  status: string;
  signed_by: string;
  signed_by_name: string;
  signed_by_role: string;
  signed_at: string;
  reason: string | null;
}

export interface WorkflowDocumentSignatureValidationApi {
  valid: boolean;
  status: string;
  document_id: string;
  version_id: string;
  version_number: number;
  signed_hash: string;
  current_hash: string;
  signed_by_name: string;
  signed_at: string;
  reason: string | null;
}

export interface WorkflowDocumentCommentApi {
  id: string;
  document_id: string;
  version_id: string | null;
  comment: string;
  author_id: string;
  author_name: string;
  author_role: string;
  created_at: string;
}

export interface WorkflowDocumentCommentListApi {
  document_id: string;
  comments: WorkflowDocumentCommentApi[];
}

export type DocumentPermissionValue = 'read' | 'write' | 'sign' | 'validate_signature' | 'admin';
export type DocumentGranteeType = 'user' | 'role' | 'department';

export interface WorkflowDocumentPermissionApi {
  id: string;
  document_id: string;
  grantee_type: DocumentGranteeType;
  grantee_id: string;
  grantee_name: string;
  permissions: DocumentPermissionValue[];
  granted_by: string;
  granted_by_name: string;
  granted_at: string;
  is_active: boolean;
}

export interface WorkflowDocumentPermissionListApi {
  document_id: string;
  permissions: WorkflowDocumentPermissionApi[];
}

export interface WorkflowDocumentPermissionCreateApi {
  grantee_type: DocumentGranteeType;
  grantee_id: string;
  permissions: DocumentPermissionValue[];
}

export interface WorkflowTaskApi {
  id: string;
  instance_id: string;
  case_code: string;
  policy_id: string;
  policy_name: string;
  task_name: string;
  requester_name: string;
  requester_email: string | null;
  department_id: string | null;
  department_name: string | null;
  form_id: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  priority: string;
  status: string;
  summary: string;
  next_action: string;
  checklist: string[];
  priority_score?: number | null;
  ai_priority_level?: string | null;
  delay_risk_level?: string | null;
  delay_risk_score?: number | null;
  priority_reasons?: string[];
  recommended_actions?: string[];
  route_recommendation?: RouteRecommendationApi | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCaseApi {
  id: string;
  case_code: string;
  policy_id: string;
  policy_name: string;
  requester_name: string;
  requester_email: string | null;
  current_task_id: string | null;
  current_task_name: string | null;
  current_department_id: string | null;
  current_department_name: string | null;
  status: string;
  subject: string;
  summary: string;
  progress: number;
  risk_level?: string;
  anomaly_flags?: string[];
  started_at: string;
  updated_at: string;
}

export interface WorkflowCatalogEntryApi {
  id: string;
  name: string;
  category: string;
  description: string;
  target_department_name: string | null;
  steps_count: number;
  forms_count: number;
  published_at: string | null;
}

export interface WorkflowTask {
  id: string;
  instanceId: string;
  processCode: string;
  policyName: string;
  taskName: string;
  requesterName: string;
  requesterType: 'interno' | 'externo';
  departmentName: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  priority: WorkflowPriority;
  status: 'nueva' | 'en_progreso' | 'pendiente' | 'reclamada';
  dueLabel: string;
  createdAtLabel: string;
  slaLabel: string;
  summary: string;
  nextAction: string;
  checklist: string[];
  formId?: string | null;
  priorityScore?: number | null;
  aiPriorityLevel?: string | null;
  delayRiskLevel?: string | null;
  delayRiskScore?: number | null;
  priorityReasons: string[];
  recommendedActions: string[];
  routeRecommendation?: RouteRecommendationApi | null;
}

export interface WorkflowCase {
  id: string;
  processCode: string;
  policyName: string;
  currentStage: string;
  currentDepartment: string;
  startedAtLabel: string;
  updatedAtLabel: string;
  progress: number;
  riskLevel?: string;
  anomalyFlags?: string[];
  ownerName: string;
  status: 'activo' | 'en_revision' | 'por_iniciar';
  milestone: string;
}

export interface WorkflowInstanceDetail {
  instance: WorkflowCase;
  diagram: WorkflowInstanceDiagramApi;
  tasks: WorkflowTask[];
}

export interface WorkflowDocument {
  id: string;
  name: string;
  version: number;
  uploadedByName: string;
  uploadedAtLabel: string;
  mimeType: string;
  sizeBytes: number;
  comment: string | null;
  scope: string;
  fileName: string;
  changeType: string;
  createdByName: string;
}

export interface WorkflowDocumentVersion {
  id: string;
  version: number;
  fileName: string;
  mimeType: string;
  sha256?: string | null;
  uploadedByName: string;
  uploadedAtLabel: string;
  comment: string | null;
  changeType: string;
  sizeBytes: number;
}

export interface WorkflowDocumentComment {
  id: string;
  documentId: string;
  versionId: string | null;
  comment: string;
  authorName: string;
  authorRole: string;
  createdAtLabel: string;
}

export interface DocumentVersionHistoryEntry {
  documentId: string;
  documentName: string;
  documentScope: string;
  currentVersion: number;
  version: WorkflowDocumentVersion;
  status: 'Vigente' | 'Histórica';
}

export interface WorkflowVersionCompareApi {
  document_id: string;
  from_version: WorkflowDocumentVersionApi;
  to_version: WorkflowDocumentVersionApi;
  same_content: boolean;
  size_delta: number;
  mime_type_changed: boolean;
  text_diff: string[];
  added_lines: number;
  removed_lines: number;
  changed_lines: number;
  similarity_ratio: number;
  visual_compare_supported: boolean;
  summary: string;
}

export interface WorkflowKpiApi {
  total_instances: number;
  active_instances: number;
  completed_instances: number;
  instances_by_status: Record<string, number>;
  pending_by_department: Array<{
    department_name: string;
    pending_tasks: number;
  }>;
}

export interface WorkflowKpiSummary {
  totalInstances: number;
  activeInstances: number;
  completedInstances: number;
  instancesByStatus: Record<string, number>;
  pendingByDepartment: Array<{
    departmentName: string;
    pendingTasks: number;
  }>;
}

export interface WorkflowCatalogEntry {
  id: string;
  policyName: string;
  category: string;
  targetDepartment: string;
  durationLabel: string;
  steps: number;
  forms: number;
  summary: string;
  launchHint: string;
}
