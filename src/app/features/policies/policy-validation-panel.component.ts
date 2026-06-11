import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PolicyValidationService, PolicyValidationResult } from '../../core/services/policy-validation.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-policy-validation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="validation-panel">
      <div class="panel-header">
        <h3>Validación y Publicación</h3>
        <button class="close-btn" (click)="onClose()" type="button" aria-label="Cerrar">×</button>
      </div>

      <div class="panel-content">
        <!-- Validation Status -->
        <div class="validation-status" [ngClass]="getStatusClass()">
          <div class="status-icon">
            <ng-container *ngIf="validationService.isValidating()">
              <span class="spinner">⟳</span>
            </ng-container>
            <ng-container *ngIf="!validationService.isValidating() && validationService.isValid()">
              <span class="check">✓</span>
            </ng-container>
            <ng-container *ngIf="!validationService.isValidating() && !validationService.isValid() && validationService.lastValidationResult()">
              <span class="error">✕</span>
            </ng-container>
          </div>
          <div class="status-text">
            <ng-container *ngIf="validationService.isValidating()">
              Validando política...
            </ng-container>
            <ng-container *ngIf="!validationService.isValidating() && validationService.isValid()">
              Política válida - Lista para publicar
            </ng-container>
            <ng-container *ngIf="!validationService.isValidating() && !validationService.isValid() && validationService.lastValidationResult()">
              Política inválida - Revise los errores
            </ng-container>
            <ng-container *ngIf="!validationService.lastValidationResult()">
              Presione "Validar" para comenzar
            </ng-container>
          </div>
        </div>

        <!-- Error Messages -->
        <div class="messages-section" *ngIf="validationService.hasErrors()">
          <div class="errors">
            <h4 class="error-title">Errores ({{ validationService.errorCount() }})</h4>
            <ul class="error-list">
              <li *ngFor="let error of validationService.lastValidationResult()?.errors">
                {{ error }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Warning Messages -->
        <div class="messages-section" *ngIf="validationService.hasWarnings()">
          <div class="warnings">
            <h4 class="warning-title">Advertencias ({{ validationService.warningCount() }})</h4>
            <ul class="warning-list">
              <li *ngFor="let warning of validationService.lastValidationResult()?.warnings">
                {{ warning }}
              </li>
            </ul>
          </div>
        </div>

        <!-- API Error -->
        <div class="api-error" *ngIf="validationService.validationError()">
          <p>{{ validationService.validationError() }}</p>
        </div>
      </div>

      <div class="panel-footer">
        <button 
          class="btn-validate" 
          (click)="onValidate()" 
          [disabled]="validationService.isValidating() || validationService.isPublishing()"
          type="button">
          <ng-container *ngIf="!validationService.isValidating()">Validar</ng-container>
          <ng-container *ngIf="validationService.isValidating()">Validando...</ng-container>
        </button>
        <button 
          class="btn-publish" 
          (click)="onPublish()" 
          [disabled]="!validationService.isReadyToPublish() || validationService.isPublishing()"
          type="button">
          <ng-container *ngIf="!validationService.isPublishing()">Publicar Política</ng-container>
          <ng-container *ngIf="validationService.isPublishing()">Publicando...</ng-container>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .validation-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f5f5f5;
      border-left: 1px solid #ddd;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: #fff;
      border-bottom: 1px solid #ddd;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      color: #000;
    }

    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .validation-status {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }

    .validation-status.valid {
      background: #e8f5e9;
      border: 1px solid #4caf50;
    }

    .validation-status.invalid {
      background: #ffebee;
      border: 1px solid #f44336;
    }

    .validation-status.validating {
      background: #e3f2fd;
      border: 1px solid #2196f3;
    }

    .validation-status.idle {
      background: #f5f5f5;
      border: 1px solid #999;
    }

    .status-icon {
      font-size: 20px;
      font-weight: bold;
    }

    .status-icon .check {
      color: #4caf50;
    }

    .status-icon .error {
      color: #f44336;
    }

    .status-icon .spinner {
      display: inline-block;
      animation: spin 1s linear infinite;
      color: #2196f3;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-text {
      font-size: 14px;
      font-weight: 500;
    }

    .messages-section {
      margin-bottom: 12px;
    }

    .errors {
      background: #fff3cd;
      border: 1px solid #f8d7da;
      border-radius: 4px;
      padding: 12px;
    }

    .warnings {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px;
    }

    .error-title,
    .warning-title {
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 600;
      color: #333;
    }

    .error-list,
    .warning-list {
      margin: 0;
      padding-left: 20px;
    }

    .error-list li,
    .warning-list li {
      margin: 4px 0;
      font-size: 13px;
      color: #333;
      line-height: 1.4;
    }

    .api-error {
      background: #ffebee;
      border: 1px solid #f44336;
      border-radius: 4px;
      padding: 12px;
      color: #c62828;
      font-size: 13px;
    }

    .panel-footer {
      display: flex;
      gap: 8px;
      padding: 16px;
      background: #fff;
      border-top: 1px solid #ddd;
    }

    .btn-validate,
    .btn-publish {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-validate {
      background: #2196f3;
      color: white;
    }

    .btn-validate:hover:not(:disabled) {
      background: #1976d2;
    }

    .btn-validate:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .btn-publish {
      background: #4caf50;
      color: white;
    }

    .btn-publish:hover:not(:disabled) {
      background: #388e3c;
    }

    .btn-publish:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  `]
})
export class PolicyValidationPanelComponent implements OnInit, OnDestroy {
  @Input() policyId!: string;
  @Output() published = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  constructor(public validationService: PolicyValidationService) {}

  ngOnInit(): void {
    // Optionally auto-validate on init if needed
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onValidate(): void {
    this.validationService.validatePolicy(this.policyId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Validation result is stored in service signals
        },
        error: (err) => {
          console.error('Validation error:', err);
        }
      });
  }

  onPublish(): void {
    this.validationService.publishPolicy(this.policyId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Policy published successfully
          this.published.emit();
        },
        error: (err) => {
          console.error('Publish error:', err);
        }
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  getStatusClass(): string {
    if (this.validationService.isValidating() || this.validationService.isPublishing()) {
      return 'validating';
    }
    if (!this.validationService.lastValidationResult()) {
      return 'idle';
    }
    return this.validationService.isValid() ? 'valid' : 'invalid';
  }
}
