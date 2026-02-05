import * as signalR from '@microsoft/signalr';
import { authService } from './auth.service';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  messageType: string;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileName?: string;
  fileSize?: string;
  replyTo?: string;
  timestamp: string;
  deliveredTo: string[];
  readBy: string[];
  reactions: Record<string, string>;
  isDeleted: boolean;
}

export interface SendMessageDto {
  chatId: string;
  messageType?: string;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileName?: string;
  fileSize?: string;
  replyTo?: string;
}

export type MessageHandler = (message: Message) => void;
export type TypingHandler = (chatId: string, userId: string, userName: string, isTyping: boolean) => void;
export type UserStatusHandler = (userId: string) => void;
export type ChatCreatedHandler = (chat: any) => void;
export type ChatUpdatedHandler = (chat: any) => void;
export type MessageStatusHandler = (chatId: string, messageId: string, userId: string) => void;
export type AgentMessageStartHandler = (message: Message) => void;
export type AgentMessageChunkHandler = (chatId: string, messageId: string, chunk: string) => void;
export type AgentMessageCompleteHandler = (chatId: string, messageId: string, fullText: string) => void;
export type DraftChangedHandler = (chatId: string, userId: string, userName: string, text: string) => void;
export type NotificationCreatedHandler = (notification: any) => void;

class SignalRService {
  private connection: signalR.HubConnection | null = null;
  private connectionPromise: Promise<void> | null = null;
  private messageHandlers: MessageHandler[] = [];
  private typingHandlers: TypingHandler[] = [];
  private userOnlineHandlers: UserStatusHandler[] = [];
  private userOfflineHandlers: UserStatusHandler[] = [];
  private chatCreatedHandlers: ChatCreatedHandler[] = [];
  private chatUpdatedHandlers: ChatUpdatedHandler[] = [];
  private messageDeliveredHandlers: MessageStatusHandler[] = [];
  private messageReadHandlers: MessageStatusHandler[] = [];
  private agentMessageStartHandlers: AgentMessageStartHandler[] = [];
  private agentMessageChunkHandlers: AgentMessageChunkHandler[] = [];
  private agentMessageCompleteHandlers: AgentMessageCompleteHandler[] = [];
  private draftChangedHandlers: DraftChangedHandler[] = [];
  private notificationCreatedHandlers: NotificationCreatedHandler[] = [];
  private maxReconnectAttempts = 5;

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      console.log('SignalR already connected');
      return;
    }

    if (
      this.connection?.state === signalR.HubConnectionState.Connecting ||
      this.connection?.state === signalR.HubConnectionState.Reconnecting
    ) {
      if (this.connectionPromise) {
        await this.connectionPromise;
      }
      return;
    }

    let token = authService.getAccessToken();
    if (!token) {
      try {
        token = await authService.refreshToken();
      } catch (error) {
        console.error('No access token available for SignalR connection');
        return;
      }
    }

    const hubUrl = import.meta.env.VITE_SIGNALR_URL || '/hub/chat';

    if (!this.connection) {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => authService.getAccessToken() || token || '',
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            if (retryContext.previousRetryCount < this.maxReconnectAttempts) {
              return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
            }
            return null;
          },
        })
        .configureLogging(signalR.LogLevel.Information)
        .build();

      // Set up event handlers
      this.setupEventHandlers();
    }

    try {
      this.connectionPromise = this.connection.start();
      await this.connectionPromise;
      this.connectionPromise = null;
      console.log('SignalR connected successfully');
    } catch (error) {
      this.connectionPromise = null;
      console.error('SignalR connection failed:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Message received
    this.connection.on('ReceiveMessage', (message: Message) => {
      console.log('Received message:', message);
      this.messageHandlers.forEach((handler) => handler(message));
    });

    // Typing indicator
    this.connection.on('UserTyping', (chatId: string, userId: string, userName: string, isTyping: boolean) => {
      this.typingHandlers.forEach((handler) => handler(chatId, userId, userName, isTyping));
    });

    // User online
    this.connection.on('UserOnline', (userId: string) => {
      this.userOnlineHandlers.forEach((handler) => handler(userId));
    });

    // User offline
    this.connection.on('UserOffline', (userId: string) => {
      this.userOfflineHandlers.forEach((handler) => handler(userId));
    });

    // Chat created
    this.connection.on('ChatCreated', (chat: any) => {
      this.chatCreatedHandlers.forEach((handler) => handler(chat));
    });

    // Chat updated
    this.connection.on('ChatUpdated', (chat: any) => {
      this.chatUpdatedHandlers.forEach((handler) => handler(chat));
    });

    // Message delivered
    this.connection.on('MessageDelivered', (chatId: string, messageId: string, userId: string) => {
      this.messageDeliveredHandlers.forEach((handler) => handler(chatId, messageId, userId));
    });

    // Message read
    this.connection.on('MessageRead', (chatId: string, messageId: string, userId: string) => {
      this.messageReadHandlers.forEach((handler) => handler(chatId, messageId, userId));
    });

    // Error handling
    this.connection.on('Error', (error: string) => {
      console.error('SignalR error:', error);
    });

    // Agent streaming
    this.connection.on('AgentMessageStart', (message: Message) => {
      this.agentMessageStartHandlers.forEach((handler) => handler(message));
    });
    this.connection.on('AgentMessageChunk', (chatId: string, messageId: string, chunk: string) => {
      this.agentMessageChunkHandlers.forEach((handler) => handler(chatId, messageId, chunk));
    });
    this.connection.on('AgentMessageComplete', (chatId: string, messageId: string, fullText: string) => {
      this.agentMessageCompleteHandlers.forEach((handler) => handler(chatId, messageId, fullText));
    });

    // Draft changed
    this.connection.on('DraftChanged', (chatId: string, userId: string, userName: string, text: string) => {
      this.draftChangedHandlers.forEach((handler) => handler(chatId, userId, userName, text));
    });

    // Notification created
    this.connection.on('NotificationCreated', (notification: any) => {
      this.notificationCreatedHandlers.forEach((handler) => handler(notification));
    });

    // Connection state changes
    this.connection.onreconnecting((error) => {
      console.log('SignalR reconnecting...', error);
    });

    this.connection.onreconnected((connectionId) => {
      console.log('SignalR reconnected:', connectionId);
    });

    this.connection.onclose((error) => {
      console.log('SignalR connection closed:', error);
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }

  async joinChat(chatId: string): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('JoinChat', chatId);
    }
  }

  async leaveChat(chatId: string): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveChat', chatId);
    }
  }

  async sendMessage(message: SendMessageDto): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('SendMessage', message);
    } else {
      throw new Error('Not connected to SignalR');
    }
  }

  async sendTypingIndicator(chatId: string, isTyping: boolean): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('TypingIndicator', chatId, isTyping);
    }
  }

  async sendDraftChanged(chatId: string, text: string): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('DraftChanged', chatId, text);
    }
  }

  async markMessageDelivered(chatId: string, messageId: string): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('MessageDelivered', chatId, messageId);
    }
  }

  async markMessageRead(chatId: string, messageId: string): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('MessageRead', chatId, messageId);
    }
  }

  async addReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    await this.connect();
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('AddReaction', chatId, messageId, emoji);
    }
  }

  // Event subscriptions
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter((h) => h !== handler);
    };
  }

  onUserOnline(handler: UserStatusHandler): () => void {
    this.userOnlineHandlers.push(handler);
    return () => {
      this.userOnlineHandlers = this.userOnlineHandlers.filter((h) => h !== handler);
    };
  }

  onUserOffline(handler: UserStatusHandler): () => void {
    this.userOfflineHandlers.push(handler);
    return () => {
      this.userOfflineHandlers = this.userOfflineHandlers.filter((h) => h !== handler);
    };
  }

  onChatCreated(handler: ChatCreatedHandler): () => void {
    this.chatCreatedHandlers.push(handler);
    return () => {
      this.chatCreatedHandlers = this.chatCreatedHandlers.filter((h) => h !== handler);
    };
  }

  onMessageDelivered(handler: MessageStatusHandler): () => void {
    this.messageDeliveredHandlers.push(handler);
    return () => {
      this.messageDeliveredHandlers = this.messageDeliveredHandlers.filter((h) => h !== handler);
    };
  }

  onMessageRead(handler: MessageStatusHandler): () => void {
    this.messageReadHandlers.push(handler);
    return () => {
      this.messageReadHandlers = this.messageReadHandlers.filter((h) => h !== handler);
    };
  }

  onChatUpdated(handler: ChatUpdatedHandler): () => void {
    this.chatUpdatedHandlers.push(handler);
    return () => {
      this.chatUpdatedHandlers = this.chatUpdatedHandlers.filter((h) => h !== handler);
    };
  }

  onAgentMessageStart(handler: AgentMessageStartHandler): () => void {
    this.agentMessageStartHandlers.push(handler);
    return () => {
      this.agentMessageStartHandlers = this.agentMessageStartHandlers.filter((h) => h !== handler);
    };
  }

  onAgentMessageChunk(handler: AgentMessageChunkHandler): () => void {
    this.agentMessageChunkHandlers.push(handler);
    return () => {
      this.agentMessageChunkHandlers = this.agentMessageChunkHandlers.filter((h) => h !== handler);
    };
  }

  onAgentMessageComplete(handler: AgentMessageCompleteHandler): () => void {
    this.agentMessageCompleteHandlers.push(handler);
    return () => {
      this.agentMessageCompleteHandlers = this.agentMessageCompleteHandlers.filter((h) => h !== handler);
    };
  }

  onDraftChanged(handler: DraftChangedHandler): () => void {
    this.draftChangedHandlers.push(handler);
    return () => {
      this.draftChangedHandlers = this.draftChangedHandlers.filter((h) => h !== handler);
    };
  }

  onNotificationCreated(handler: NotificationCreatedHandler): () => void {
    this.notificationCreatedHandlers.push(handler);
    return () => {
      this.notificationCreatedHandlers = this.notificationCreatedHandlers.filter((h) => h !== handler);
    };
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }
}

export const signalRService = new SignalRService();
