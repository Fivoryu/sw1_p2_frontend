import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PolicyPublishResponse {
  id: string;
  status: string;
  validation: PolicyValidationResult;
  published_at: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class PolicyValidationService {
  private apiUrl = `${environment.apiBaseUrl}${environment.apiV1Prefix}/policies`;

  // Signals for reactive state
  isValidating = signal(false);
  isPublishing = signal(false);
  lastValidationResult = signal<PolicyValidationResult | null>(null);
  validationError = signal<string | null>(null);

  // Computed properties
  isValid = computed(() => this.lastValidationResult()?.valid ?? false);
  hasErrors = computed(() => (this.lastValidationResult()?.errors ?? []).length > 0);
  hasWarnings = computed(() => (this.lastValidationResult()?.warnings ?? []).length > 0);
  errorCount = computed(() => (this.lastValidationResult()?.errors ?? []).length);
  warningCount = computed(() => (this.lastValidationResult()?.warnings ?? []).length);

  constructor(private http: HttpClient) {}

  /**
   * Validate a policy without publishing (HU-2.6)
   */
  validatePolicy(policyId: string): Observable<PolicyValidationResult> {
    this.isValidating.set(true);
    this.validationError.set(null);

    return this.http.post<PolicyValidationResult>(`${this.apiUrl}/${policyId}/validate`, {}).pipe(
      tap(result => {
        this.lastValidationResult.set(result);
        this.isValidating.set(false);
      }),
      catchError(error => {
        const errorMessage = error?.error?.detail || 'Error during validation';
        this.validationError.set(errorMessage);
        this.isValidating.set(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Publish a policy after validation (HU-2.6)
   */
  publishPolicy(policyId: string, validateBeforePublish = true): Observable<PolicyPublishResponse> {
    this.isPublishing.set(true);
    this.validationError.set(null);

    const body = { validate_before_publish: validateBeforePublish };

    return this.http.put<PolicyPublishResponse>(`${this.apiUrl}/${policyId}/publish`, body).pipe(
      tap(response => {
        this.lastValidationResult.set(response.validation);
        this.isPublishing.set(false);
      }),
      catchError(error => {
        const errorMessage = error?.error?.detail || 'Error during publication';
        this.validationError.set(errorMessage);
        this.isPublishing.set(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Clear validation state
   */
  clearValidation(): void {
    this.lastValidationResult.set(null);
    this.validationError.set(null);
  }

  /**
   * Get formatted error message
   */
  getFormattedErrors(): string {
    const errors = this.lastValidationResult()?.errors ?? [];
    return errors.length > 0 ? errors.join('\n• ') : '';
  }

  /**
   * Get formatted warning message
   */
  getFormattedWarnings(): string {
    const warnings = this.lastValidationResult()?.warnings ?? [];
    return warnings.length > 0 ? warnings.join('\n• ') : '';
  }

  /**
   * Check if policy is ready to publish
   */
  isReadyToPublish(): boolean {
    return this.isValid() && !this.isValidating() && !this.isPublishing();
  }
}
