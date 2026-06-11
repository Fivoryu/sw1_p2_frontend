import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WorkflowDocumentApi, WorkflowDocumentVersionApi, WorkflowDocumentVersionListApi } from '../models/workflow.models';
import { ApiService } from './api.service';

export interface DocumentCollabEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface DocumentPresenceUser {
  user_id: string;
  user_email: string;
  user_name: string;
}

export interface DocumentCollabSnapshotApi {
  document_id: string;
  editable: boolean;
  version_number: number;
  mime_type: string;
  content: string;
  connected_users: DocumentPresenceUser[];
}

@Injectable({ providedIn: 'root' })
export class DocumentCollabService {
  private readonly api = inject(ApiService);
  private socket: WebSocket | null = null;
  private readonly events$ = new Subject<DocumentCollabEvent>();
  private connectedDocumentId = '';

  readonly isConnected = signal(false);
  readonly presenceUsers = signal<DocumentPresenceUser[]>([]);
  readonly editingUsers = signal<DocumentPresenceUser[]>([]);
  readonly lastEvent = signal<DocumentCollabEvent | null>(null);
  readonly activeUserCount = computed(() => this.presenceUsers().length);

  connectToDocument(documentId: string, userId: string, userEmail: string, userName: string): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.connectedDocumentId === documentId) {
      return;
    }
    this.disconnect();
    const wsBase = (environment.wsUrl || 'ws://localhost:8000/ws').replace(/\/$/, '');
    const wsUrl = `${wsBase}/documents/${documentId}/collab?user_id=${userId}&user_email=${encodeURIComponent(userEmail)}&user_name=${encodeURIComponent(userName)}`;
    this.connectedDocumentId = documentId;
    this.socket = new WebSocket(wsUrl);
    this.socket.onopen = () => this.isConnected.set(true);
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DocumentCollabEvent;
        if (data.type === 'document.collab.presence' || data.type === 'document.collab.join' || data.type === 'document.collab.leave') {
          this.presenceUsers.set((data.payload['presence'] as DocumentPresenceUser[]) || []);
        }
        if (data.type === 'document.edit.active') {
          const user = data.payload as unknown as DocumentPresenceUser;
          this.editingUsers.update((users) => {
            if (users.some((u) => u.user_id === user.user_id)) return users;
            return [...users, user];
          });
        }
        if (data.type === 'document.edit.idle') {
          const userId = data.payload['user_id'] as string;
          this.editingUsers.update((users) => users.filter((u) => u.user_id !== userId));
        }
        this.lastEvent.set(data);
        this.events$.next(data);
      } catch (error) {
        console.error('Error parsing document WebSocket message:', error);
      }
    };
    this.socket.onerror = () => this.isConnected.set(false);
    this.socket.onclose = () => {
      this.socket = null;
      this.connectedDocumentId = '';
      this.isConnected.set(false);
      this.presenceUsers.set([]);
    };
  }

  onEvent(): Observable<DocumentCollabEvent> {
    return this.events$.asObservable();
  }

  onEventType(type: string): Observable<DocumentCollabEvent> {
    return this.events$.pipe(filter((event) => event.type === type));
  }

  getSnapshot(documentId: string): Observable<DocumentCollabSnapshotApi> {
    return this.api.get<DocumentCollabSnapshotApi>(`/documents/${documentId}/collab/snapshot`);
  }

  saveContent(documentId: string, content: string, baseVersion?: number | null, comment?: string): Observable<WorkflowDocumentApi> {
    return this.api.post<WorkflowDocumentApi>(`/documents/${documentId}/collab/save`, {
      content,
      base_version: baseVersion ?? null,
      comment: comment?.trim() || null,
    });
  }

  sendEditing(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'document.collab.editing' }));
    }
  }

  sendIdle(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'document.collab.idle' }));
    }
  }

  getVersions(documentId: string): Observable<WorkflowDocumentVersionListApi> {
    return this.api.get<WorkflowDocumentVersionListApi>(`/documents/${documentId}/versions`);
  }

  getVersionContent(documentId: string, versionId: string): Observable<Blob> {
    return this.api.getBlob(`/documents/${documentId}/versions/${versionId}/content`);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectedDocumentId = '';
    this.isConnected.set(false);
    this.presenceUsers.set([]);
    this.editingUsers.set([]);
  }
}
