import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { ApiService } from './api.service';
import { CurrentUser, LoginResponse } from '../models/auth.models';


@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenKey = 'sw1_access_token';
  private readonly userKey = 'sw1_current_user';
  private readonly currentUserSubject = new BehaviorSubject<CurrentUser | null>(this.readStoredUser());

  currentUser$ = this.currentUserSubject.asObservable();

  login(email: string, password: string) {
    return this.api.post<LoginResponse>('/auth/login', { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.tokenKey, res.access_token);
        localStorage.setItem(this.userKey, JSON.stringify(res.user));
        this.currentUserSubject.next(res.user);
      })
    );
  }

  loadCurrentUser(): Observable<CurrentUser | null> {
    if (!this.getToken()) {
      this.currentUserSubject.next(null);
      return of(null);
    }

    return this.api.get<CurrentUser>('/auth/me').pipe(
      tap((user) => {
        localStorage.setItem(this.userKey, JSON.stringify(user));
        this.currentUserSubject.next(user);
      }),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUserSubject.value;
  }

  isAdminRole(): boolean {
    return this.getCurrentUser()?.role_name === 'administrador';
  }

  isSupervisorRole(): boolean {
    return this.getCurrentUser()?.role_name === 'supervisor';
  }

  isFuncionarioRole(): boolean {
    return this.getCurrentUser()?.role_name === 'funcionario';
  }

  isClienteRole(): boolean {
    return this.getCurrentUser()?.role_name === 'cliente';
  }

  canAccessWorkflowPortal(): boolean {
    return this.isFuncionarioRole() || this.isClienteRole() || this.isSupervisorRole();
  }

  canAccessAuditPanel(): boolean {
    return this.hasPermission('audit:read');
  }

  canAccessAdminPanel(): boolean {
    return this.isAdminRole() || this.isSupervisorRole();
  }

  defaultRouteForRole(): string {
    if (this.isFuncionarioRole()) {
      return '/workflow/panel';
    }

    if (this.isClienteRole()) {
      return '/workflow/seguimiento';
    }

    if (this.isSupervisorRole()) {
      return '/panel/control';
    }

    return '/panel/control';
  }

  hasPermission(permission: string): boolean {
    const permissions = new Set(this.getCurrentUser()?.permissions ?? []);
    return permissions.has('*') || permissions.has(permission);
  }

  canReadDocuments(): boolean {
    return this.hasPermission('documents:read');
  }

  canWriteDocuments(): boolean {
    return this.hasPermission('documents:write');
  }

  canSignDocuments(): boolean {
    return this.hasPermission('documents:sign');
  }

  canValidateDocumentSignatures(): boolean {
    return this.hasPermission('documents:validate_signature');
  }

  canAdminDocuments(): boolean {
    return this.hasPermission('documents:admin');
  }

  canUseAi(): boolean {
    return this.hasPermission('ai:use');
  }

  canUseAiReports(): boolean {
    return this.hasPermission('reports:ai');
  }

  canWriteAdminData(): boolean {
    return this.isAdminRole();
  }

  logout(): void {
    this.api.post('/auth/logout', {}).subscribe({ error: () => undefined });
    this.clearSession();
  }

  logoutLocal(): void {
    this.clearSession();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  isReady(): boolean {
    return this.currentUserSubject.value !== undefined;
  }

  userDisplayName(): Observable<string> {
    return this.currentUser$.pipe(map((user) => user?.full_name ?? ''));
  }

  private clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  private readStoredUser(): CurrentUser | null {
    const stored = localStorage.getItem(this.userKey);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as CurrentUser;
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }
}
