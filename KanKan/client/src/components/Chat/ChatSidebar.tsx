import React from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
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
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { setActiveChat, fetchMessages } from '@/store/chatSlice';
import { authService } from '@/services/auth.service';
import { Chat } from '@/services/chat.service';
import { formatDistanceToNow } from 'date-fns';

interface ChatSidebarProps {
  onNewChat: () => void;
  sx?: SxProps<Theme>;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, sx }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { chats, activeChat, loading } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChatSelect = (chat: Chat) => {
    dispatch(setActiveChat(chat));
    dispatch(fetchMessages({ chatId: chat.id }));
  };

  const handleLogout = () => {
    authService.logout().finally(() => {
      window.location.href = '/login';
    });
  };

  const formatLastMessageTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
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
        ...sx,
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar src={user?.avatarUrl} sx={{ width: 36, height: 36 }}>
              {user?.displayName?.[0]}
            </Avatar>
            <Typography variant="subtitle1" fontWeight="bold">
              {user?.displayName || 'Chats'}
            </Typography>
          </Box>
          <Box>
            <IconButton color="primary" onClick={onNewChat} title="New Chat">
              <AddIcon />
            </IconButton>
            <IconButton onClick={handleLogout} title="Logout">
              <LogoutIcon />
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
          filteredChats.map((chat) => (
            <ListItemButton
              key={chat.id}
              selected={activeChat?.id === chat.id}
              onClick={() => handleChatSelect(chat)}
              sx={{
                py: 1.5,
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ListItemAvatar>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  variant="dot"
                  color="success"
                  invisible={
                    chat.chatType === 'group' ||
                    !chat.participants.some((p) => p.userId !== user?.id && p.isOnline)
                  }
                >
                  <Avatar src={chat.avatar} variant="rounded" sx={{ width: 48, height: 48 }}>
                    {chat.name?.[0]}
                  </Avatar>
                </Badge>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={chat.unreadCount > 0 ? 'bold' : 'medium'}
                      noWrap
                      sx={{ maxWidth: 180 }}
                    >
                      {chat.name}
                    </Typography>
                    {chat.lastMessage && (
                      <Typography variant="caption" color="text.secondary">
                        {formatLastMessageTime(chat.lastMessage.timestamp)}
                      </Typography>
                    )}
                  </Box>
                }
                secondary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{
                        maxWidth: 200,
                        fontWeight: chat.unreadCount > 0 ? 'bold' : 'normal',
                      }}
                    >
                      {chat.lastMessage
                        ? `${chat.lastMessage.senderName === user?.displayName ? 'You: ' : ''}${chat.lastMessage.text}`
                        : 'No messages yet'}
                    </Typography>
                    {chat.unreadCount > 0 && (
                      <Badge
                        badgeContent={chat.unreadCount}
                        color="primary"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                }
              />
            </ListItemButton>
          ))
        )}
      </List>
    </Box>
  );
};
