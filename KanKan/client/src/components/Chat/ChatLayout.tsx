import React, { useEffect, useState } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
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
  setTypingUser,
  updateUserOnlineStatus,
  markMessageDelivered,
  markMessageRead,
  startAgentMessage,
  appendAgentMessageChunk,
  finalizeAgentMessage,
  setDraft,
} from '@/store/chatSlice';

export const ChatLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch<AppDispatch>();
  const { activeChat } = useSelector((state: RootState) => state.chat);
  const [showSidebar, setShowSidebar] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);

  useEffect(() => {
    // Fetch chats on mount
    dispatch(fetchChats());

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
      dispatch(addMessage(message));
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

    const unsubAgentStart = signalRService.onAgentMessageStart((message) => {
      dispatch(startAgentMessage(message));
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
      unsubAgentStart();
      unsubAgentChunk();
      unsubAgentComplete();
      unsubDraft();
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Box
        sx={{
          display: 'flex',
          flexGrow: 1,
          pt: 8,
          bgcolor: 'background.default',
        }}
      >
        {/* Sidebar - Chat List */}
        {showSidebar && (
          <ChatSidebar
            onNewChat={() => setNewChatOpen(true)}
            sx={{
              width: isMobile ? '100%' : 350,
              flexShrink: 0,
            }}
          />
        )}

        {/* Main Chat Window */}
        {(!isMobile || !showSidebar) && (
          <ChatWindow
            onBack={isMobile ? handleBackToList : undefined}
            onToggleSidebar={!isMobile ? () => setShowSidebar((prev) => !prev) : undefined}
            sx={{ flexGrow: 1 }}
          />
        )}

        {/* New Chat Dialog */}
        <NewChatDialog
          open={newChatOpen}
          onClose={() => setNewChatOpen(false)}
        />
      </Box>
    </Box>
  );
};
