import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  AIClassifyResponseApi,
  AIAssistantContextApi,
  AIAssistantQueryResponseApi,
  AIFormSuggestResponseApi,
  AnomalyAlertApi,
  AnomalyListApi,
  BottleneckAnalysisApi,
  BottleneckPredictionListApi,
  AIReportExportRequestApi,
  AIReportExportResponseApi,
  AIReportResponseApi,
  ReassignmentListApi,
  RouteRecommendationApi,
} from '../models/ai.models';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly api = inject(ApiService);

  classifyRequest(text: string) {
    return this.api.post<AIClassifyResponseApi>('/ai/classify-request', { text });
  }

  classifyRequestFromAudio(audioBlob: Blob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'solicitud.webm');
    return this.api.post<AIClassifyResponseApi>('/ai/classify-request/audio', formData);
  }

  generateReport(query: string, exportFormat = 'dashboard') {
    return this.api.post<AIReportResponseApi>('/ai/reports/text', {
      query,
      input_type: 'text',
      export_format: exportFormat,
    });
  }

  generateReportFromAudio(audioBlob: Blob, exportFormat = 'dashboard') {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'consulta.webm');
    formData.append('export_format', exportFormat);
    return this.api.post<AIReportResponseApi>('/ai/reports/audio', formData);
  }

  exportReport(payload: AIReportExportRequestApi) {
    return this.api.post<AIReportExportResponseApi>('/ai/reports/export', payload);
  }

  suggestFormValues(taskId: string, text: string) {
    return this.api.post<AIFormSuggestResponseApi>('/ai/forms/suggest', { task_id: taskId, text });
  }

  suggestFormValuesFromAudio(taskId: string, audioBlob: Blob) {
    const formData = new FormData();
    formData.append('task_id', taskId);
    formData.append('audio', audioBlob, 'formulario.webm');
    return this.api.post<AIFormSuggestResponseApi>('/ai/forms/suggest/audio', formData);
  }

  recommendRoute(instanceId: string, taskId: string) {
    return this.api.post<RouteRecommendationApi>('/ai/recommend-route', { instance_id: instanceId, task_id: taskId });
  }

  getAnomalies(filters: { status?: string; severity?: string; entity_type?: string } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.api.get<AnomalyListApi>(`/ai/anomalies${suffix}`);
  }

  runAnomalyDetection() {
    return this.api.post<AnomalyAlertApi[]>('/ai/anomalies/run-detection', {});
  }

  acknowledgeAnomaly(alertId: string, notes?: string) {
    return this.api.patch<AnomalyAlertApi>(`/ai/anomalies/${alertId}/acknowledge`, { notes: notes ?? null });
  }

  dismissAnomaly(alertId: string) {
    return this.api.patch<AnomalyAlertApi>(`/ai/anomalies/${alertId}/dismiss`, {});
  }

  getBottlenecks() {
    return this.api.get<BottleneckAnalysisApi>('/ai/bottlenecks');
  }

  suggestReassignments(instanceId?: string) {
    const suffix = instanceId ? `?instance_id=${instanceId}` : '';
    return this.api.get<ReassignmentListApi>(`/ai/suggest-reassignments${suffix}`);
  }

  executeReassignment(taskId: string, targetUserId: string) {
    return this.api.post<{ status: string; task_id: string; from: string; to: string }>('/ai/reassign', {
      task_id: taskId,
      target_user_id: targetUserId,
    });
  }

  getBottleneckPredictions(days = 7) {
    return this.api.get<BottleneckPredictionListApi>(`/ai/bottleneck-predictions?days=${days}`);
  }

  assistantQuery(query: string, context: AIAssistantContextApi) {
    return this.api.post<AIAssistantQueryResponseApi>('/ai/assistant/query', { query, context });
  }

  assistantVoice(audioBlob: Blob, context: AIAssistantContextApi) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'asistente.webm');
    formData.append('route', context.route);
    formData.append('page_category', context.page_category);
    formData.append('page_title', context.page_title);
    return this.api.post<AIAssistantQueryResponseApi>('/ai/assistant/voice', formData);
  }
}
