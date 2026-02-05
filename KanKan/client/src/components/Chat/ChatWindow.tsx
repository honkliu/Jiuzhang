import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Avatar,
  Typography,
  IconButton,
  TextField,
  Popper,
  Paper,
  Stack,
  Chip,
  SxProps,
  Theme,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  EmojiEmotions as EmojiIcon,
  Menu as MenuIcon,
  PushPin as PushPinIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMessages, addMessage } from '@/store/chatSlice';
import { MessageBubble } from './MessageBubble';
import { signalRService } from '@/services/signalr.service';
import { chatService } from '@/services/chat.service';
import { mediaService } from '@/services/media.service';

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
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
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

  type ChatCommandId = '/w' | '/wa' | '/h' | '/b' | '/i' | '/r';
  const CHAT_COMMANDS: Array<{ id: ChatCommandId; description: string; example: string }> = [
    { id: '/w', description: 'List all participants in this chat (including Assistant)', example: '/w' },
    { id: '/wa', description: 'List active (online) participants in this chat', example: '/wa' },
    { id: '/h', description: 'Show command help', example: '/h' },
    { id: '/b', description: 'Send the rest of your input in bold', example: '/b hello' },
    { id: '/i', description: 'Send the rest of your input in italic', example: '/i hello' },
    { id: '/r', description: 'Send the rest of your input in red', example: '/r hello' },
  ];

  const isCommandMode = messageText.startsWith('/');
  const commandToken = (() => {
    if (!isCommandMode) return null;
    const firstSpace = messageText.indexOf(' ');
    return (firstSpace === -1 ? messageText : messageText.slice(0, firstSpace)).trim();
  })();

  const commandSuggestions = (() => {
    if (!isCommandMode) return [];
    const prefix = commandToken ?? '/';
    return CHAT_COMMANDS.filter((c) => c.id.startsWith(prefix as string));
  })();

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandToken]);

  const addLocalInfoMessage = (text: string) => {
    if (!activeChat) return;

    const infoMessage = {
      id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      chatId: activeChat.id,
      senderId: 'user_ai_wa',
      senderName: 'Assistant',
      senderAvatar: '',
      messageType: 'text',
      text,
      timestamp: new Date().toISOString(),
      deliveredTo: [],
      readBy: [],
      reactions: {},
      isDeleted: false,
    };

    dispatch(addMessage(infoMessage as any));
  };

  const runChatCommand = async (rawInput: string) => {
    if (!activeChat) return;

    const firstSpace = rawInput.indexOf(' ');
    const cmd = (firstSpace === -1 ? rawInput : rawInput.slice(0, firstSpace)).trim() as string;
    const rest = (firstSpace === -1 ? '' : rawInput.slice(firstSpace + 1)).trim();

    const known = CHAT_COMMANDS.some((c) => c.id === cmd);
    if (!known || cmd === '/' || cmd.length === 0) {
      addLocalInfoMessage(
        [
          'Available commands:',
          ...CHAT_COMMANDS.map((c) => `  ${c.example}  — ${c.description}`),
          '',
          "Tip: commands only work when '/' is the first character.",
        ].join('\n')
      );
      return;
    }

    switch (cmd as ChatCommandId) {
      case '/h':
        addLocalInfoMessage(
          ['Available commands:', ...CHAT_COMMANDS.map((c) => `  ${c.example}  — ${c.description}`)].join('\n')
        );
        return;

      case '/w': {
        const names = activeChat.participants.map((p) => p.displayName);
        addLocalInfoMessage(`Participants (${names.length}):\n  ${names.join('\n  ')}`);
        return;
      }

      case '/wa': {
        const active = activeChat.participants.filter((p) => p.isOnline);
        const names = active.map((p) => p.displayName);
        addLocalInfoMessage(
          active.length === 0
            ? 'No active (online) participants right now.'
            : `Active participants (${names.length}):\n  ${names.join('\n  ')}`
        );
        return;
      }

      case '/r': {
        if (!rest) {
          addLocalInfoMessage('Usage: /r <text>');
          return;
        }
        const formatted = `[red]${rest}[/red]`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }

      case '/b': {
        if (!rest) {
          addLocalInfoMessage("Usage: /b <text>");
          return;
        }
        const formatted = `**${rest}**`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }

      case '/i': {
        if (!rest) {
          addLocalInfoMessage('Usage: /i <text>');
          return;
        }
        const formatted = `*${rest}*`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }
    }
  };

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
    if (!activeChat || sending) return;

    // Commands only trigger when '/' is the first character.
    // Leading whitespace like "  /w" is NOT a command.
    const raw = messageText;
    if (raw.startsWith('/')) {
      setMessageText('');
      signalRService.sendDraftChanged(activeChat.id, '');
      setSending(true);

      try {
        await runChatCommand(raw);
      } catch (error) {
        console.error('Failed to run command:', error);
        setMessageText(raw);
        signalRService.sendDraftChanged(activeChat.id, raw);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }

      return;
    }

    if (!raw.trim()) return;

    const text = raw.trim();
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

  const guessMessageType = (file: File): 'image' | 'video' | 'voice' | 'file' => {
    const type = file.type || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'voice';
    return 'file';
  };

  const handlePickFile = () => {
    if (uploading || sending) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    try {
      setUploading(true);
      const upload = await mediaService.upload(file);
      const messageType = guessMessageType(file);

      const message = await chatService.sendMessage(activeChat.id, {
        messageType,
        mediaUrl: upload.url,
        fileName: upload.fileName || file.name,
        fileSize: String(upload.size ?? file.size),
      });

      dispatch(addMessage(message));
    } catch (error) {
      console.error('Failed to upload/send file:', error);
      alert('Failed to send file. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isCommandMode || commandSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCommandSelectedIndex((i) => Math.min(i + 1, commandSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCommandSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const next = commandSuggestions[commandSelectedIndex] ?? commandSuggestions[0];
      setMessageText(`${next.id} `);
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
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <IconButton size="small" disabled>
            <EmojiIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={handlePickFile}
            disabled={uploading || sending}
            title="Attach"
            aria-label="Attach"
          >
            {uploading ? <CircularProgress size={18} /> : <PushPinIcon />}
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
            onKeyDown={handleKeyDown}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.100',
              },
            }}
          />
          <Popper
            open={isCommandMode && commandSuggestions.length > 0}
            anchorEl={inputRef.current}
            placement="top-start"
            sx={{ zIndex: 1300 }}
          >
            <Paper
              elevation={6}
              sx={{
                width: 'fit-content',
                maxWidth: 'calc(100vw - 32px)',
                mb: 1,
                px: 1,
                py: 0.75,
              }}
            >
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {commandSuggestions.map((c, idx) => (
                  <Chip
                    key={c.id}
                    size="small"
                    label={c.id}
                    color={idx === commandSelectedIndex ? 'primary' : 'default'}
                    variant={idx === commandSelectedIndex ? 'filled' : 'outlined'}
                    onMouseEnter={() => setCommandSelectedIndex(idx)}
                    onClick={() => setMessageText(`${c.id} `)}
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))}
              </Stack>
            </Paper>
          </Popper>
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sending || uploading}
          >
            {sending ? <CircularProgress size={24} /> : <SendIcon />}
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};
