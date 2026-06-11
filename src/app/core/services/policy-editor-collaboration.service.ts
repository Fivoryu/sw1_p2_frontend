import { Injectable, signal, computed } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EditorEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface PresenceUser {
  user_id: string;
  user_email: string;
  user_name: string;
}

@Injectable({ providedIn: 'root' })
export class PolicyEditorCollaborationService {
  private socket: WebSocket | null = null;
  private readonly events$ = new Subject<EditorEvent>();

  readonly isConnected = signal(false);
  readonly accessRevoked = signal(false);
  readonly presenceUsers = signal<PresenceUser[]>([]);
  readonly diagramVersion = signal(1);
  readonly diagramTimestamp = signal('');

  readonly activeUserCount = computed(() => this.presenceUsers().length);

  connectToPolicy(policyId: string, userId: string, userEmail: string, userName: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const wsBase = (environment.wsUrl || 'ws://localhost:8000/ws').replace(/\/$/, '');
    const wsUrl = `${wsBase}/policies/${policyId}/editor?user_id=${userId}&user_email=${encodeURIComponent(userEmail)}&user_name=${encodeURIComponent(userName)}`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.isConnected.set(true);
    };

    this.socket.onmessage = (event) => {
      try {
        const data: EditorEvent = JSON.parse(event.data);

        if (data.type === 'policy.editor.presence') {
          const presence = (data.payload['presence'] as PresenceUser[]) || [];
          this.presenceUsers.set(presence);
          this.diagramVersion.set((data.payload['diagram_version'] as number) || 1);
          this.diagramTimestamp.set((data.payload['diagram_timestamp'] as string) || '');
        } else if (data.type === 'policy.editor.access_revoked') {
          this.accessRevoked.set(true);
        } else if (data.type === 'policy.editor.access_granted') {
          this.accessRevoked.set(false);
        } else if (data.type === 'policy.editor.join' || data.type === 'policy.editor.leave') {
          const presence = (data.payload['presence'] as PresenceUser[]) || [];
          this.presenceUsers.set(presence);
        }

        this.events$.next(data);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.isConnected.set(false);
    };

    this.socket.onclose = (event) => {
      const wasConnected = this.isConnected();
      if (event.code === 1008 && wasConnected) {
        this.accessRevoked.set(true);
      }
      this.socket = null;
      this.isConnected.set(false);
      this.presenceUsers.set([]);
    };
  }

  sendDiagramChange(eventType: string, data: Record<string, unknown>): void {
    if (this.accessRevoked()) {
      return;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: `policy.diagram.${eventType}`,
        payload: data,
      } satisfies EditorEvent)
    );
  }

  sendFormUpdate(data: Record<string, unknown>): void {
    if (this.accessRevoked()) {
      return;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: 'policy.form.updated',
        payload: data,
      } satisfies EditorEvent)
    );
  }

  onEvent(): Observable<EditorEvent> {
    return this.events$.asObservable();
  }

  onEventType(type: string): Observable<EditorEvent> {
    return this.events$.asObservable().pipe(filter((event) => event.type === type));
  }

  markAccessRevoked(): void {
    this.accessRevoked.set(true);
  }

  markAccessGranted(): void {
    this.accessRevoked.set(false);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.isConnected.set(false);
    this.accessRevoked.set(false);
    this.presenceUsers.set([]);
  }
}
