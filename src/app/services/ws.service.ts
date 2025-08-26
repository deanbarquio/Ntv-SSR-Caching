import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type InvalidateMsg = { type: 'products:invalidate' };
export type Message = InvalidateMsg | { type: string; [k: string]: any };

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket?: WebSocket;
  private readonly _messages = new Subject<Message>();
  readonly messages: Observable<Message> = this._messages.asObservable();

  constructor(private zone: NgZone) {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const currentPort = window.location.port;
      // Try multiple endpoints to increase resilience across dev/prod
      const preferStandaloneFirst = currentPort === '4200';
      const candidates = preferStandaloneFirst
        ? [
            // Standalone WS first in Angular dev to avoid proxy ECONNREFUSED noise
            `${protocol}://${host}:4001/ws`,
            // Same-origin (works with Angular proxy or nginx)
            `${protocol}://${window.location.host}/ws`,
            // SSR server default
            `${protocol}://${host}:4000/ws`,
          ]
        : [
            // Same-origin (works with Angular proxy or nginx)
            `${protocol}://${window.location.host}/ws`,
            // SSR server default
            `${protocol}://${host}:4000/ws`,
            // Standalone WS fallback in dev
            `${protocol}://${host}:4001/ws`,
          ];
      this.tryConnectSequentially(candidates);
    }
  }

  private tryConnectSequentially(urls: string[], index = 0) {
    if (index >= urls.length) return;
    const url = urls[index];
    console.log('[WS] Attempting connect to:', url);
    try {
      this.socket = new WebSocket(url);
      const onError = () => {
        console.warn('[WS] Connect failed, trying next if any');
        this.socket?.close();
        this.tryConnectSequentially(urls, index + 1);
      };
      this.socket.onopen = () => {
        console.log('[WS] connected:', url);
      };
      this.socket.onerror = onError;
      this.socket.onclose = () => {
        // If we connected before and then lost it, retry the same url first
        setTimeout(() => this.tryConnectSequentially([url, ...urls.slice(index + 1)], 0), 1500);
      };
      this.socket.onmessage = (event) => {
        this.zone.run(() => {
          try {
            const data = JSON.parse(event.data);
            this._messages.next(data as Message);
          } catch {}
        });
      };
    } catch {}
  }

  private connect(url: string) {
    try {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => {
        console.log('[WS] connected');
      };
      this.socket.onmessage = (event) => {
        this.zone.run(() => {
          try {
            const data = JSON.parse(event.data);
            this._messages.next(data as Message);
          } catch {}
        });
      };
      this.socket.onerror = (event) => {
        console.error('[WS] error', event);
      };
      this.socket.onclose = () => {
        // basic reconnect with backoff
        setTimeout(() => this.connect(url), 1500);
      };
    } catch {}
  }
}
