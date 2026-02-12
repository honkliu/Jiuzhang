import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon } from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { ChatSidebar } from './ChatSidebar';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { signalRService } from '@/services/signalr.service';
import { RootState, AppDispatch } from '@/store';
import { AppHeader } from '@/components/Shared/AppHeader';
import {
  fetchChats,
  addMessage,
  addChat,
  updateChat,
  incrementUnread,
  setTypingUser,
  updateUserOnlineStatus,
  upsertParticipantProfile,
  markMessageDelivered,
  markMessageRead,
  startAgentMessage,
  appendAgentMessageChunk,
  finalizeAgentMessage,
  setDraft,
  clearDraftForUser,
} from '@/store/chatSlice';
import { addNotification, fetchUnreadNotificationCount } from '@/store/notificationsSlice';
import { chatService } from '@/services/chat.service';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const ChatLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch<AppDispatch>();
  const { activeChat, chats } = useSelector((state: RootState) => state.chat);
  const myUserId = useSelector((state: RootState) => state.auth.user?.id);
  const [showSidebar, setShowSidebar] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const chatIdsRef = useRef<Set<string>>(new Set());
  const inFlightChatFetchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? null;
  }, [activeChat?.id]);

  useEffect(() => {
    myUserIdRef.current = myUserId ?? null;
  }, [myUserId]);

  useEffect(() => {
    chatIdsRef.current = new Set(chats.map((c) => c.id));
  }, [chats]);

  useEffect(() => {
    // Fetch chats on mount
    dispatch(fetchChats());
    dispatch(fetchUnreadNotificationCount());

    // Connect to SignalR
    const connectSignalR = async () => {
      try {
        await signalRService.connect();
      } catch (error) {
        console.error('Failed to connect to SignalR:', error);
      }
    };

    connectSignalR();

    // Set up SignalR event handlers
    const unsubMessage = signalRService.onMessage((message) => {
      dispatch(clearDraftForUser({ chatId: message.chatId, userId: message.senderId }));
      dispatch(addMessage(message));

      // New message indicator: increment unread for inactive chats.
      const activeChatId = activeChatIdRef.current;
      const currentUserId = myUserIdRef.current;
      if (message.chatId !== activeChatId && message.senderId !== currentUserId) {
        if (chatIdsRef.current.has(message.chatId)) {
          dispatch(incrementUnread({ chatId: message.chatId, by: 1 }));
          return;
        }

        if (inFlightChatFetchRef.current.has(message.chatId)) return;
        inFlightChatFetchRef.current.add(message.chatId);

        void (async () => {
          try {
            const chat = await chatService.getChat(message.chatId);
            dispatch(addChat(chat));
            dispatch(incrementUnread({ chatId: message.chatId, by: 1 }));
          } catch (error) {
            console.error('Failed to fetch chat for incoming message:', error);
            dispatch(fetchChats());
          } finally {
            inFlightChatFetchRef.current.delete(message.chatId);
          }
        })();
      }
    });

    const unsubTyping = signalRService.onTyping((chatId, userId, userName, isTyping) => {
      dispatch(setTypingUser({ chatId, userId, userName, isTyping }));
    });

    const unsubOnline = signalRService.onUserOnline((userId) => {
      dispatch(updateUserOnlineStatus({ userId, isOnline: true }));
    });

    const unsubOffline = signalRService.onUserOffline((userId) => {
      dispatch(updateUserOnlineStatus({ userId, isOnline: false }));
    });

    const unsubChatCreated = signalRService.onChatCreated((chat) => {
      dispatch(addChat(chat));
    });

    const unsubChatUpdated = signalRService.onChatUpdated((chat) => {
      dispatch(updateChat(chat));
    });

    const unsubDelivered = signalRService.onMessageDelivered((chatId, messageId, userId) => {
      dispatch(markMessageDelivered({ chatId, messageId, userId }));
    });

    const unsubRead = signalRService.onMessageRead((chatId, messageId, userId) => {
      dispatch(markMessageRead({ chatId, messageId, userId }));
    });

    const unsubNotification = signalRService.onNotificationCreated((notification) => {
      dispatch(addNotification(notification));
    });

    const unsubUserUpdated = signalRService.onUserUpdated((updated) => {
      dispatch(
        upsertParticipantProfile({
          userId: updated.userId,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
          gender: updated.gender,
        })
      );
    });
    const unsubAgentStart = signalRService.onAgentMessageStart((message) => {
      dispatch(startAgentMessage(message));

      const activeChatId = activeChatIdRef.current;
      const currentUserId = myUserIdRef.current;
      if (message.chatId !== activeChatId && message.senderId !== currentUserId) {
        if (chatIdsRef.current.has(message.chatId)) {
          dispatch(incrementUnread({ chatId: message.chatId, by: 1 }));
          return;
        }

        if (inFlightChatFetchRef.current.has(message.chatId)) return;
        inFlightChatFetchRef.current.add(message.chatId);

        void (async () => {
          try {
            const chat = await chatService.getChat(message.chatId);
            dispatch(addChat(chat));
            dispatch(incrementUnread({ chatId: message.chatId, by: 1 }));
          } catch (error) {
            console.error('Failed to fetch chat for incoming agent message:', error);
            dispatch(fetchChats());
          } finally {
            inFlightChatFetchRef.current.delete(message.chatId);
          }
        })();
      }
    });

    const unsubAgentChunk = signalRService.onAgentMessageChunk((chatId, messageId, chunk) => {
      dispatch(appendAgentMessageChunk({ chatId, messageId, chunk }));
    });

    const unsubAgentComplete = signalRService.onAgentMessageComplete((chatId, messageId, fullText) => {
      dispatch(finalizeAgentMessage({ chatId, messageId, fullText }));
    });

    const unsubDraft = signalRService.onDraftChanged((chatId, userId, userName, text) => {
      dispatch(setDraft({ chatId, userId, userName, text }));
    });

    // Cleanup
    return () => {
      unsubMessage();
      unsubTyping();
      unsubOnline();
      unsubOffline();
      unsubChatCreated();
      unsubChatUpdated();
      unsubDelivered();
      unsubRead();
      unsubNotification();
      unsubAgentStart();
      unsubAgentChunk();
      unsubAgentComplete();
      unsubDraft();
      unsubUserUpdated();
      signalRService.disconnect();
    };
  }, [dispatch]);

  // On mobile, hide sidebar when chat is selected
  useEffect(() => {
    if (isMobile && activeChat) {
      setShowSidebar(false);
    }
  }, [isMobile, activeChat]);

  const handleBackToList = () => {
    setShowSidebar(true);
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <AppHeader />
      <BoxAny
        sx={{
          display: 'flex',
          height: 'calc(100vh - 64px)',
          mt: '64px',
          bgcolor: 'background.default',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Sidebar - Chat List */}
        {showSidebar ? (
          <ChatSidebar
            onNewChat={() => setNewChatOpen(true)}
            onCollapse={() => setShowSidebar(false)}
            sx={{
              width: isMobile ? '100%' : 300,
              flexShrink: 0,
              height: '100%',
              minHeight: 0,
            }}
          />
        ) : !isMobile ? (
          // Collapsed rail (desktop): keep expand control on the left.
          <BoxAny
            sx={{
              width: 48,
              flexShrink: 0,
              height: '100%',
              minHeight: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              pt: 1,
            }}
          >
            <IconButton onClick={() => setShowSidebar(true)} title="Expand" size="small">
              <KeyboardDoubleArrowRightIcon />
            </IconButton>
          </BoxAny>
        ) : null}

        {/* Main Chat Window */}
        {(!isMobile || !showSidebar) && (
          <ChatWindow
            onBack={isMobile ? handleBackToList : undefined}
            sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, height: '100%' }}
          />
        )}

        {/* New Chat Dialog */}
        <NewChatDialog
          open={newChatOpen}
          onClose={() => setNewChatOpen(false)}
        />
      </BoxAny>
    </BoxAny>
  );
};
