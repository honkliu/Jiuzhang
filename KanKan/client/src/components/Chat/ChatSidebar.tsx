import React from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Typography,
  Badge,
  IconButton,
  AppBar,
  Toolbar,
  InputBase,
  SxProps,
  Theme,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { setActiveChat, fetchMessages, clearUnread, removeChat } from '@/store/chatSlice';
import { chatService, Chat } from '@/services/chat.service';
import { GroupAvatar } from '@/components/Shared/GroupAvatar';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { getDirectDisplayParticipant, getOtherRealParticipants, isRealGroupChat, WA_USER_ID } from '@/utils/chatParticipants';

interface ChatSidebarProps {
  onNewChat: () => void;
  onCollapse?: () => void;
  sx?: SxProps<Theme>;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, onCollapse, sx }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { chats, activeChat, loading } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChatSelect = (chat: Chat) => {
    dispatch(setActiveChat(chat));
    dispatch(clearUnread({ chatId: chat.id }));
    dispatch(fetchMessages({ chatId: chat.id }));
  };

  const handleClearChat = async (chat: Chat) => {
    const label = 'Clear this chat?\n\nThis will hide previous messages. The chat will reappear when a new message arrives.';
    if (!window.confirm(label)) return;
    try {
      await chatService.clearChat(chat.id);
      dispatch(removeChat(chat.id));
    } catch (e) {
      console.error('Failed to clear chat', e);
      alert('Failed to clear chat. Please try again.');
    }
  };

  const truncateText = (text: string, maxLen: number) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const getLastMessagePreview = (chat: Chat) => {
    if (!chat.lastMessage) return 'No messages yet';
    const senderPrefix = chat.lastMessage.senderName === user?.displayName
      ? 'You: '
      : `${chat.lastMessage.senderName}: `;
    return truncateText(`${senderPrefix}${chat.lastMessage.text || ''}`, 44);
  };

  const getGroupParticipantsLine = (chat: Chat) => {
    const meId = user?.id;
    const names = chat.participants
      .filter((p) => p.userId !== WA_USER_ID)
      .filter((p) => !meId || p.userId !== meId)
      .map((p) => p.displayName)
      .filter(Boolean);

    const shown = names.slice(0, 4);
    const extra = names.length - shown.length;
    const base = shown.join(' · ');
    return base + (extra > 0 ? ` +${extra}` : '');
  };

  const formatLastMessageTime = (timestamp: string) => {
    try {
      const dt = new Date(timestamp);
      const ms = Date.now() - dt.getTime();
      if (!Number.isFinite(ms) || ms < 0) return '';

      const totalMinutes = Math.floor(ms / 60000);
      if (totalMinutes < 1) return '1 m. ago';
      if (totalMinutes < 60) return `${totalMinutes} m. ago`;

      const totalHours = Math.floor(totalMinutes / 60);
      if (totalHours < 24) return `${totalHours} h. ago`;

      const totalDays = Math.floor(totalHours / 24);
      if (totalDays < 7) return `${totalDays} d. ago`;

      const totalWeeks = Math.floor(totalDays / 7);
      if (totalWeeks < 52) return `${totalWeeks} w. ago`;

      const totalYears = Math.max(1, Math.floor(totalDays / 365));
      return `${totalYears} y. ago`;
    } catch {
      return '';
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
        minHeight: 0,
        ...sx,
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Chat
          </Typography>
          <Box>
            {onCollapse && (
              <IconButton onClick={onCollapse} title="Collapse" size="small">
                <KeyboardDoubleArrowLeftIcon />
              </IconButton>
            )}
            <IconButton color="primary" onClick={onNewChat} title="New Chat">
              <AddIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Search */}
      <Box sx={{ p: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'action.hover',
            borderRadius: 2,
            px: 2,
            py: 0.5,
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
          <InputBase
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            sx={{ fontSize: '0.9rem' }}
          />
        </Box>
      </Box>

      {/* Chat List */}
      <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
        {loading && chats.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">Loading chats...</Typography>
          </Box>
        ) : filteredChats.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {searchQuery ? 'No chats found' : 'No chats yet. Start a new conversation!'}
            </Typography>
          </Box>
        ) : (
          filteredChats.map((chat) => {
            const meId = user?.id;
            const isGroup = isRealGroupChat(chat, meId);

            return (
            <ListItemButton
              key={chat.id}
              selected={activeChat?.id === chat.id}
              onClick={() => handleChatSelect(chat)}
              sx={{
                py: 1.5,
                position: 'relative',
                pr: 5,
                '& .chatRowActions': {
                  opacity: 0,
                  pointerEvents: 'none',
                  transition: 'opacity 120ms ease',
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                },
                '&:hover .chatRowActions, &:focus-within .chatRowActions': {
                  opacity: 1,
                  pointerEvents: 'auto',
                },
                ...(chat.unreadCount > 0 && activeChat?.id !== chat.id
                  ? { bgcolor: 'rgba(25, 118, 210, 0.06)' }
                  : null),
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ListItemAvatar>
                <Badge
                  overlap="rectangular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  variant="dot"
                  color="success"
                  invisible={
                    isGroup ||
                    !chat.participants.some(
                      (p) => p.userId !== user?.id && p.userId !== WA_USER_ID && p.isOnline
                    )
                  }
                >
                  {isGroup ? (
                    <GroupAvatar
                      size={48}
                      members={(() => {
                        const others = getOtherRealParticipants(chat, meId);
                        const source = others.length > 0 ? others : chat.participants.filter((p) => p.userId !== WA_USER_ID);
                        return source.map((p) => ({
                          avatarUrl: p.avatarUrl,
                          gender: p.gender,
                          displayName: p.displayName,
                        }));
                      })()}
                    />
                  ) : (
                    (() => {
                      const m = getDirectDisplayParticipant(chat, user?.id);
                      return (
                        <UserAvatar
                          src={m?.avatarUrl}
                          gender={m?.gender}
                          fallbackText={m?.displayName || chat.name}
                          variant="rounded"
                          sx={{ width: 48, height: 48 }}
                        />
                      );
                    })()
                  )}
                </Badge>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight={chat.unreadCount > 0 ? 'bold' : 'medium'}
                        noWrap
                        sx={{ minWidth: 0, flex: 1 }}
                      >
                        {chat.name}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, justifyContent: 'flex-end' }}>
                      {chat.unreadCount > 0 && (
                        <Box
                          sx={{
                            minWidth: 20,
                            height: 20,
                            px: 0.75,
                            borderRadius: 10,
                            bgcolor: 'error.main',
                            color: 'error.contrastText',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                          title={`${chat.unreadCount} new message${chat.unreadCount === 1 ? '' : 's'}`}
                        >
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </Box>
                      )}

                      {chat.lastMessage && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                          title={chat.lastMessage.timestamp}
                        >
                          {formatLastMessageTime(chat.lastMessage.timestamp)}
                        </Typography>
                      )}

                      <Box className="chatRowActions" sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton
                          size="small"
                          title="Clear"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleClearChat(chat);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                }
                secondary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      {isGroup && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ display: 'block', maxWidth: 220 }}
                        >
                          {getGroupParticipantsLine(chat)}
                        </Typography>
                      )}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{
                          maxWidth: 220,
                          fontWeight: chat.unreadCount > 0 ? 'bold' : 'normal',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={chat.lastMessage ? `${chat.lastMessage.senderName}: ${chat.lastMessage.text}` : undefined}
                      >
                        {getLastMessagePreview(chat)}
                      </Typography>
                    </Box>
                  </Box>
                }
              />
            </ListItemButton>
            );
          })
        )}
      </List>
    </Box>
  );
};
