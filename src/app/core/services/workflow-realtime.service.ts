import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkflowRealtimeService {
  private socket: WebSocket | null = null;
  readonly isConnected = signal(false);
  readonly lastEvent = signal<{ type: string; payload: Record<string, unknown> } | null>(null);

  connect(userId: string, departmentId?: string | null): void {
    if (!userId) {
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    this.disconnect();
    const wsBase = (environment.wsUrl || 'ws://localhost:8000/ws').replace(/\/$/, '');
    const params = new URLSearchParams({ user_id: userId });
    if (departmentId) {
      params.set('department_id', departmentId);
    }
    this.socket = new WebSocket(`${wsBase}/workflow?${params.toString()}`);
    this.socket.onopen = () => this.isConnected.set(true);
    this.socket.onmessage = (event) => {
      try {
        this.lastEvent.set(JSON.parse(event.data) as { type: string; payload: Record<string, unknown> });
      } catch {
        this.lastEvent.set(null);
      }
    };
    this.socket.onclose = () => {
      this.isConnected.set(false);
      this.socket = null;
    };
    this.socket.onerror = () => this.isConnected.set(false);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.isConnected.set(false);
  }
}
