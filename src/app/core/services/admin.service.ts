import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuditLog, Department, Role, User } from '../models/admin.models';
import { AIPolicyGenerateResponse, Policy, PolicyCollaborator, PolicyDiagram, PolicyDraftCreate, PolicyForm, PolicyFormCreate } from '../models/policy.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  listUsers(): Observable<User[]> {
    return this.api.get<User[]>('/users/');
  }

  getUsers(): Observable<User[]> {
    return this.listUsers();
  }

  createUser(body: unknown): Observable<User> {
    return this.api.post<User>('/users/', body);
  }

  updateUser(id: string, body: unknown): Observable<User> {
    return this.api.patch<User>(`/users/${id}`, body);
  }

  deactivateUser(id: string): Observable<void> {
    return this.api.delete<void>(`/users/${id}`);
  }

  listRoles(): Observable<Role[]> {
    return this.api.get<Role[]>('/roles/');
  }

  createRole(body: unknown): Observable<Role> {
    return this.api.post<Role>('/roles/', body);
  }

  updateRole(id: string, body: unknown): Observable<Role> {
    return this.api.patch<Role>(`/roles/${id}`, body);
  }

  deleteRole(id: string): Observable<void> {
    return this.api.delete<void>(`/roles/${id}`);
  }

  listDepartments(): Observable<Department[]> {
    return this.api.get<Department[]>('/departments/');
  }

  createDepartment(body: unknown): Observable<Department> {
    return this.api.post<Department>('/departments/', body);
  }

  updateDepartment(id: string, body: unknown): Observable<Department> {
    return this.api.patch<Department>(`/departments/${id}`, body);
  }

  deleteDepartment(id: string): Observable<void> {
    return this.api.delete<void>(`/departments/${id}`);
  }

  listAudit(limit = 20): Observable<AuditLog[]> {
    return this.api.get<AuditLog[]>(`/audit/?limit=${limit}`);
  }

  listPolicies(): Observable<Policy[]> {
    return this.api.get<Policy[]>('/policies/');
  }

  getPolicy(id: string): Observable<Policy> {
    return this.api.get<Policy>(`/policies/${id}`);
  }

  createPolicyDraft(body: PolicyDraftCreate): Observable<Policy> {
    return this.api.post<Policy>('/policies/drafts', body);
  }

  updatePolicyDiagram(id: string, body: PolicyDiagram): Observable<Policy> {
    return this.api.put<Policy>(`/policies/${id}/diagram`, body);
  }

  listPolicyForms(id: string): Observable<PolicyForm[]> {
    return this.api.get<PolicyForm[]>(`/policies/${id}/forms`);
  }

  createPolicyForm(id: string, body: PolicyFormCreate): Observable<PolicyForm> {
    return this.api.post<PolicyForm>(`/policies/${id}/forms`, body);
  }

  updatePolicyForm(id: string, formId: string, body: PolicyFormCreate): Observable<PolicyForm> {
    return this.api.put<PolicyForm>(`/policies/${id}/forms/${formId}`, body);
  }

  listPolicyCollaborators(policyId: string): Observable<PolicyCollaborator[]> {
    return this.api.get<PolicyCollaborator[]>(`/policies/${policyId}/collaborators`);
  }

  addPolicyCollaborator(policyId: string, body: { user_id: string }): Observable<PolicyCollaborator[]> {
    return this.api.post<PolicyCollaborator[]>(`/policies/${policyId}/collaborators`, body);
  }

  removePolicyCollaborator(policyId: string, userId: string): Observable<void> {
    return this.api.delete<void>(`/policies/${policyId}/collaborators/${userId}`);
  }

  enableCompanyShare(policyId: string): Observable<{ company_shared: boolean; message: string }> {
    return this.api.post<{ company_shared: boolean; message: string }>(
      `/policies/${policyId}/company-share`, {}
    );
  }

  disableCompanyShare(policyId: string): Observable<{ company_shared: boolean; message: string }> {
    return this.api.delete<{ company_shared: boolean; message: string }>(
      `/policies/${policyId}/company-share`
    );
  }

  generatePolicyFromText(prompt: string): Observable<AIPolicyGenerateResponse> {
    return this.api.post<AIPolicyGenerateResponse>('/ai/policies/generate', { prompt });
  }

  generatePolicyFromAudio(audioBlob: Blob): Observable<AIPolicyGenerateResponse> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'politica.webm');
    return this.api.post<AIPolicyGenerateResponse>('/ai/policies/generate/audio', formData);
  }
}
