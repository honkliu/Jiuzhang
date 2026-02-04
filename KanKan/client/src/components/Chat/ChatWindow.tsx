import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Avatar,
  Typography,
  IconButton,
  Button,
  TextField,
  SxProps,
  Theme,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  EmojiEmotions as EmojiIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMessages, addMessage } from '@/store/chatSlice';
import { MessageBubble } from './MessageBubble';
import { signalRService } from '@/services/signalr.service';
import { mediaService } from '@/services/media.service';
import { chatService } from '@/services/chat.service';

interface ChatWindowProps {
  onBack?: () => void;
  onToggleSidebar?: () => void;
  sx?: SxProps<Theme>;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ onBack, onToggleSidebar, sx }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { activeChat, messages, typingUsers, loading, drafts } = useSelector(
    (state: RootState) => state.chat
  );
  const { user } = useSelector((state: RootState) => state.auth);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatMessages = activeChat ? messages[activeChat.id] || [] : [];
  const chatTypingUsers = activeChat ? typingUsers[activeChat.id] || [] : [];
  const chatDrafts = activeChat ? drafts[activeChat.id] || {} : {};

  const draftMessages = activeChat
    ? Object.entries(chatDrafts)
        .filter(([userId]) => userId !== user?.id)
        .map(([userId, draft]) => {
          const participant = activeChat.participants.find((p) => p.userId === userId);
          return {
            id: `draft_${activeChat.id}_${userId}`,
            chatId: activeChat.id,
            senderId: userId,
            senderName: participant?.displayName || draft.userName,
            senderAvatar: participant?.avatarUrl || '',
            messageType: 'text',
            text: draft.text,
            timestamp: new Date().toISOString(),
            deliveredTo: [],
            readBy: [],
            reactions: {},
            isDeleted: false,
          };
        })
    : [];

  const mergedMessages = [...chatMessages, ...draftMessages];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedMessages]);

  // Join chat room when active chat changes
  useEffect(() => {
    if (activeChat) {
      signalRService.joinChat(activeChat.id);
      dispatch(fetchMessages({ chatId: activeChat.id }));
    }
    return () => {
      if (activeChat) {
        signalRService.leaveChat(activeChat.id);
      }
    };
  }, [activeChat?.id, dispatch]);

  // Mark messages as delivered/read when viewing the chat
  useEffect(() => {
    if (!activeChat || !user?.id) return;

    chatMessages.forEach((message) => {
      if (message.senderId !== user.id) {
        if (!message.deliveredTo.includes(user.id)) {
          signalRService.markMessageDelivered(activeChat.id, message.id);
        }
        if (!message.readBy.includes(user.id)) {
          signalRService.markMessageRead(activeChat.id, message.id);
        }
      }
    });
  }, [activeChat?.id, chatMessages, user?.id]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChat || sending) return;

    const text = messageText.trim();
    setMessageText('');
    signalRService.sendDraftChanged(activeChat.id, '');
    setSending(true);

    try {
      const message = await chatService.sendMessage(activeChat.id, {
        messageType: 'text',
        text,
      });
      dispatch(addMessage(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(text); // Restore message on error
      signalRService.sendDraftChanged(activeChat.id, text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeChat || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    e.target.value = '';

    setUploading(true);
    try {
      const upload = await mediaService.upload(file);

      const contentType = file.type || upload.contentType;
      let messageType: 'image' | 'video' | 'voice' | 'file' = 'file';

      if (contentType.startsWith('image/')) messageType = 'image';
      else if (contentType.startsWith('video/')) messageType = 'video';
      else if (contentType.startsWith('audio/')) messageType = 'voice';

      const message = await chatService.sendMessage(activeChat.id, {
        messageType,
        mediaUrl: upload.url,
      });
      dispatch(addMessage(message));
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setUploading(false);
    }
  };


  // Get online participant for direct chats
  const otherParticipant = activeChat?.chatType === 'direct'
    ? activeChat.participants.find((p) => p.userId !== user?.id)
    : null;

  if (!activeChat) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.50',
          ...sx,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          Select a chat to start messaging
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          or start a new conversation
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'grey.100',
        ...sx,
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          {onToggleSidebar && (
            <IconButton edge="start" onClick={onToggleSidebar} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          {onBack && (
            <IconButton edge="start" onClick={onBack} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <Avatar src={activeChat.avatar} sx={{ width: 40, height: 40, mr: 2 }}>
            {activeChat.name?.[0]}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {activeChat.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {chatTypingUsers.length > 0
                ? `${chatTypingUsers.map((u) => u.userName).join(', ')} is typing...`
                : otherParticipant?.isOnline
                ? 'Online'
                : activeChat.chatType === 'group'
                ? `${activeChat.participants.length} members`
                : 'Offline'}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {loading && mergedMessages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : mergedMessages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography color="text.secondary">
              No messages yet. Say hello! 👋
            </Typography>
          </Box>
        ) : (
          mergedMessages.map((message, index) => {
            const prevMessage = index > 0 ? mergedMessages[index - 1] : null;
            const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === user?.id}
                showAvatar={showAvatar}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <IconButton size="small" onClick={handleAttachClick} disabled={uploading}>
            <AttachFileIcon />
          </IconButton>
          <IconButton size="small" disabled>
            <EmojiIcon />
          </IconButton>
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => {
              const nextValue = e.target.value;
              setMessageText(nextValue);
              if (activeChat) {
                signalRService.sendDraftChanged(activeChat.id, nextValue);
              }
            }}
            onKeyPress={handleKeyPress}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.100',
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sending || uploading}
          >
            {sending ? <CircularProgress size={24} /> : <SendIcon />}
          </IconButton>
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileChange}
        />
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button size="small" onClick={handleAttachClick} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Attach File'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
