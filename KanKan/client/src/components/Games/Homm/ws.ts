// Realtime game events over SignalR (/hub/homm), authenticated with the KanKan JWT, with automatic reconnect.
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { authService } from '@/services/auth.service';
import type { WsEvent } from './types';

type Handler = (e: WsEvent) => void;

export class GameSocket {
  private conn: HubConnection | null = null;
  private handlers = new Set<Handler>();
  private gameId: string | null = null;

  connect(gameId: string): void {
    if (this.conn && this.gameId === gameId) return;
    this.close();
    this.gameId = gameId;
    const conn = new HubConnectionBuilder()
      .withUrl(`/hub/homm?gameId=${encodeURIComponent(gameId)}`, {
        accessTokenFactory: () => authService.getAccessToken() ?? ''
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    conn.on('event', (e: WsEvent) => { for (const h of this.handlers) h(e); });
    this.conn = conn;
    conn.start().catch(() => { /* the views still refresh on their own actions */ });
  }

  /** Subscribe to events; returns an unsubscribe function. */
  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => { this.handlers.delete(h); };
  }

  close(): void {
    const conn = this.conn;
    this.conn = null;
    this.gameId = null;
    if (conn) void conn.stop();
  }
}

export const socket = new GameSocket();
