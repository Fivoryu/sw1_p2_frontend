export interface AIClassifySuggestionApi {
  policy_id: string;
  policy_name: string;
  confidence: number;
  reason: string;
  category?: string;
  description?: string;
  target_department_name?: string | null;
  steps_count?: number;
  forms_count?: number;
}

export interface AIClassifyResponseApi {
  suggestions: AIClassifySuggestionApi[];
  transcribed_text?: string | null;
}

export interface AIReportResponseApi {
  title: string;
  query: string;
  report_type: string;
  interpreted: Record<string, unknown>;
  filters: Record<string, unknown>;
  group_by: string[];
  metrics: string[];
  summary: string;
  columns: string[];
  column_labels: Record<string, string>;
  hidden_columns: string[];
  rows: Array<Record<string, unknown>>;
  export_format: string;
  interpreter: string;
  warnings: string[];
  mime_type: string | null;
  file_name: string | null;
  export_content_base64: string | null;
  suggestions: string[];
  transcribed_text: string | null;
}

export interface AIReportExportRequestApi {
  title: string;
  columns: string[];
  column_labels: Record<string, string>;
  hidden_columns: string[];
  rows: Array<Record<string, unknown>>;
  export_format: string;
}

export interface AIReportExportResponseApi {
  mime_type: string;
  file_name: string;
  export_content_base64: string;
}

export interface AIFormSuggestResponseApi {
  suggestions: Record<string, unknown>;
  confidence: Record<string, number>;
  transcribed_text: string | null;
}

export interface RouteCandidateApi {
  user_id: string;
  user_name: string;
  score: number;
  current_workload: number;
  avg_resolution_hours: number;
  historical_cases: number;
}

export interface RouteRecommendationApi {
  task_id: string;
  department_name: string;
  candidates: RouteCandidateApi[];
  recommended_user_id: string | null;
  recommended_user_name: string | null;
  reasoning: string;
}

export interface AnomalyAlertApi {
  id: string;
  alert_type: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  description: string;
  metrics: Record<string, unknown>;
  status: string;
  detected_at: string;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  notes: string | null;
}

export interface AnomalyListApi {
  total: number;
  open_count: number;
  alerts: AnomalyAlertApi[];
}

export interface BottleneckSummaryApi {
  critical: number;
  high: number;
  medium: number;
  open_tasks: number;
  active_instances: number;
  departments_analyzed: number;
  policies_analyzed: number;
}

export interface BottleneckDepartmentLoadApi {
  department_id: string;
  department_name: string;
  pending_tasks: number;
  active_staff: number;
  tasks_per_staff: number;
  avg_wait_hours: number;
  avg_service_hours: number;
  arrivals_24h: number;
  exits_24h: number;
  severity: string;
}

export interface BottleneckFindingApi {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  department_name: string | null;
  activity_name: string | null;
  policy_names: string[];
  metrics: Record<string, unknown>;
  recommendation: string;
}

export interface BottleneckPolicyFindingApi {
  policy_id: string;
  policy_name: string;
  severity: string;
  active_instances: number;
  weak_departments: string[];
  fork_imbalance: number;
  fork_label: string | null;
  departments_in_flow: number;
  recommendation: string;
}

export interface BottleneckAnalysisApi {
  generated_at: string;
  summary: BottleneckSummaryApi;
  department_load: BottleneckDepartmentLoadApi[];
  findings: BottleneckFindingApi[];
  policy_findings: BottleneckPolicyFindingApi[];
  recommendations: string[];
}

export interface ReassignmentSuggestionApi {
  task_id: string;
  task_priority: string;
  current_user_id: string;
  current_user_name: string;
  current_workload: number;
  target_user_id: string;
  target_user_name: string;
  target_workload: number;
  target_avg_hours: number;
  confidence: number;
}

export interface ReassignmentListApi {
  suggestions: ReassignmentSuggestionApi[];
}

export interface BottleneckPredictionApi {
  activity_id: string;
  activity_label: string;
  current_queue: number;
  predicted_max_queue_7d: number;
  predicted_series: number[];
  severity: string;
  recommendation: string;
}

export interface BottleneckPredictionListApi {
  predictions: BottleneckPredictionApi[];
}

export interface AIAssistantContextApi {
  route: string;
  page_category: string;
  page_title: string;
  relevant_ids: Record<string, string>;
}

export interface AIAssistantQueryResponseApi {
  answer: string;
  suggestions: string[];
  action_type: string | null;
  redirect_url: string | null;
  redirect_label: string | null;
  transcribed_text: string | null;
}
