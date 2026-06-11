import { Injectable, NgZone, signal } from '@angular/core';
import { ChatMessage } from './chat.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChatRealtimeService {
  private ws: WebSocket | null = null;
  private userId = '';

  readonly isConnected = signal(false);
  readonly lastMessage = signal<ChatMessage | null>(null);

  constructor(private readonly ngZone: NgZone) {}

  connect(userId: string): void {
    if (this.ws || !userId) return;
    this.userId = userId;

    const wsBase = (environment.wsUrl || 'ws://localhost:8000/ws').replace(/\/$/, '');
    const wsUrl = `${wsBase}/chat?user_id=${encodeURIComponent(userId)}`;

    this.ngZone.runOutsideAngular(() => {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => this.ngZone.run(() => this.isConnected.set(true));
      this.ws.onclose = () => this.ngZone.run(() => { this.isConnected.set(false); this.ws = null; });
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat.message') {
            this.ngZone.run(() => this.lastMessage.set(data.message as ChatMessage));
          }
        } catch { /* ignore */ }
      };
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.isConnected.set(false);
  }
}
