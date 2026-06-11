import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket: WebSocket | null = null;
  private readonly messages$ = new Subject<string>();

  connect(): void {
    if (this.socket) {
      return;
    }

    this.socket = new WebSocket(environment.wsUrl);
    this.socket.onmessage = (event) => this.messages$.next(event.data);
    this.socket.onclose = () => {
      this.socket = null;
    };
  }

  send(message: string): void {
    this.socket?.send(message);
  }

  onMessage(): Observable<string> {
    return this.messages$.asObservable();
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
