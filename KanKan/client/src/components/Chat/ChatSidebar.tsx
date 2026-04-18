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
  useMediaQuery,
  useTheme,
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
import {
  getDirectDisplayParticipant,
  getOtherRealParticipants,
  getRealParticipants,
  isRealGroupChat,
  WA_USER_ID,
} from '@/utils/chatParticipants';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const sidebarHeaderActionButtonSx = {
  width: 36,
  height: 31,
  minWidth: 36,
  p: 0,
};

interface ChatSidebarProps {
  onNewChat: () => void;
  onCollapse?: () => void;
  sx?: SxProps<Theme>;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, onCollapse, sx }) => {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const dispatch = useDispatch<AppDispatch>();
  const { chats, activeChat, loading } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = React.useState('');
  const lastTouchSelectRef = React.useRef(0);

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChatSelect = (chat: Chat) => {
    dispatch(setActiveChat(chat));
    dispatch(clearUnread({ chatId: chat.id }));
    dispatch(fetchMessages({ chatId: chat.id }));
  };

  const handleChatClick = (chat: Chat) => () => {
    if (Date.now() - lastTouchSelectRef.current < 500) return;
    handleChatSelect(chat);
  };

  const handleChatPointerUp = (chat: Chat) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    lastTouchSelectRef.current = Date.now();
    handleChatSelect(chat);
  };

  const handleClearChat = async (chat: Chat) => {
    const label = t('chat.clearConfirm');
    if (!window.confirm(label)) return;
    try {
      await chatService.clearChat(chat.id);
      dispatch(removeChat(chat.id));
    } catch (e) {
      console.error('Failed to clear chat', e);
      alert(t('chat.clearFailed'));
    }
  };

  const truncateText = (text: string, maxLen: number) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLen) return cleaned;
    return `${cleaned.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const getLocalizedParticipantName = (userId?: string, displayName?: string) => {
    return userId === WA_USER_ID ? t('Wa') : (displayName || '');
  };

  const getLastMessagePreview = (chat: Chat) => {
    if (!chat.lastMessage) return t('chat.noMessagesShort');
    const senderName = getLocalizedParticipantName(chat.lastMessage.senderId, chat.lastMessage.senderName);
    const senderPrefix = chat.lastMessage.senderId === user?.id
      ? `${t('chat.you')}: `
      : `${senderName}: `;
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
      if (totalMinutes < 1) return t('time.justNow');
      if (totalMinutes < 60) return `${totalMinutes} ${t('time.minute')}`;

      const totalHours = Math.floor(totalMinutes / 60);
      if (totalHours < 24) return `${totalHours} ${t('time.hour')}`;

      const totalDays = Math.floor(totalHours / 24);
      if (totalDays < 7) return `${totalDays} ${t('time.day')}`;

      const totalWeeks = Math.floor(totalDays / 7);
      if (totalWeeks < 52) return `${totalWeeks} ${t('time.week')}`;

      const totalYears = Math.max(1, Math.floor(totalDays / 365));
      return `${totalYears} ${t('time.year')}`;
    } catch {
      return '';
    }
  };

  return (
    <BoxAny
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
            {t('chat.title')}
          </Typography>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {onCollapse && !isCompact && (
              <IconButton onClick={onCollapse} title={t('nav.collapse')} size="small" sx={sidebarHeaderActionButtonSx}>
                <KeyboardDoubleArrowLeftIcon />
              </IconButton>
            )}
            <IconButton color="primary" onClick={onNewChat} title={t('nav.newChat')} sx={sidebarHeaderActionButtonSx}>
              <AddIcon />
            </IconButton>
          </BoxAny>
        </Toolbar>
      </AppBar>

      {/* Search */}
      <BoxAny sx={{ p: 1 }}>
        <BoxAny
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
            placeholder={t('chat.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            sx={{ fontSize: '0.9rem' }}
          />
        </BoxAny>
      </BoxAny>

      {/* Chat List */}
      <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
        {loading && chats.length === 0 ? (
          <BoxAny sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">{t('chat.loading')}</Typography>
          </BoxAny>
        ) : filteredChats.length === 0 ? (
          <BoxAny sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {searchQuery ? t('chat.emptySearch') : t('chat.empty')}
            </Typography>
          </BoxAny>
        ) : (
          filteredChats.map((chat) => {
            const meId = user?.id;
            const isGroup = isRealGroupChat(chat, meId);
            const hasWa = (chat.participants || []).some((p) => p.userId === WA_USER_ID);
            const realParticipants = getRealParticipants(chat.participants);
            const isWaOnlyChat = !isGroup && hasWa && realParticipants.length <= 1;
            const showUnread = chat.unreadCount > 0 && !isWaOnlyChat;
            const directDisplayParticipant = isGroup ? undefined : getDirectDisplayParticipant(chat, user?.id);
            const displayChatName = directDisplayParticipant?.userId === WA_USER_ID
              ? t('Wa')
              : chat.name;

            return (
            <ListItemButton
              key={chat.id}
              selected={activeChat?.id === chat.id}
              onClick={handleChatClick(chat)}
              onPointerUp={handleChatPointerUp(chat)}
              sx={{
                py: '6px',
                pl: 1,
                borderRadius: '8px',
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
                ...(showUnread && activeChat?.id !== chat.id
                  ? { bgcolor: 'rgba(25, 118, 210, 0.06)' }
                  : null),
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
                '&.Mui-selected .MuiTypography-root': {
                  color: 'primary.main',
                },
                '&.Mui-selected .MuiTypography-root.MuiTypography-caption': {
                  color: 'primary.main',
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
                      const m = directDisplayParticipant;
                      return (
                        <UserAvatar
                          src={m?.avatarUrl}
                          gender={m?.gender}
                          fallbackText={getLocalizedParticipantName(m?.userId, m?.displayName) || displayChatName}
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
                  <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight={showUnread ? 'bold' : 'medium'}
                        noWrap
                        sx={{ minWidth: 0, flex: 1 }}
                      >
                        {activeChat?.id === chat.id ? `${displayChatName} *` : displayChatName}
                      </Typography>
                    </BoxAny>
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, justifyContent: 'flex-end' }}>
                      {showUnread && (
                        <BoxAny
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
                          title={`${chat.unreadCount} ${t('chat.message.unread')}`}
                        >
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </BoxAny>
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

                      <BoxAny className="chatRowActions" sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton
                          size="small"
                          title={t('chat.clear')}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleClearChat(chat);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </BoxAny>
                    </BoxAny>
                  </BoxAny>
                }
                secondary={
                  <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <BoxAny sx={{ minWidth: 0 }}>
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
                          fontWeight: showUnread ? 'bold' : 'normal',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={chat.lastMessage ? `${getLocalizedParticipantName(chat.lastMessage.senderId, chat.lastMessage.senderName)}: ${chat.lastMessage.text}` : undefined}
                      >
                        {getLastMessagePreview(chat)}
                      </Typography>
                    </BoxAny>
                  </BoxAny>
                }
              />
            </ListItemButton>
            );
          })
        )}
      </List>
    </BoxAny>
  );
};
