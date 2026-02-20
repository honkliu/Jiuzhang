import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Box,
  Typography,
  CircularProgress,
  Chip,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon, Close as CloseIcon } from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { createChat } from '@/store/chatSlice';
import { contactService, User } from '@/services/contact.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { useLanguage } from '@/i18n/LanguageContext';
import { WA_USER_ID } from '@/utils/chatParticipants';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
}

export const NewChatDialog: React.FC<NewChatDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const currentUserId = useSelector((state: RootState) => state.auth.user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      loadUsers();
    }
    return () => {
      setSearchQuery('');
      setSelectedUsers([]);
      setUsers([]);
    };
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [allUsers, contacts] = await Promise.all([
        contactService.getAllUsers(),
        contactService.getContacts(),
      ]);
      setUsers(allUsers);
      setFriends(contacts);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      setLoading(true);
      try {
        const results = await contactService.searchUsers(query);
        setUsers(results);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    } else if (query.length === 0) {
      loadUsers();
    }
  };

  const handleSelectUser = (user: User) => {
    if (!isSelectable(user.id)) {
      return;
    }
    if (selectedUsers.some((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0 || !canCreateChat) return;

    setCreating(true);
    try {
      await dispatch(
        createChat({
          participantIds: selectedUsers.map((u) => u.id),
          chatType: selectedUsers.length > 1 ? 'group' : 'direct',
          groupName: selectedUsers.length > 1
            ? selectedUsers.map((u) => u.displayName).join(', ')
            : undefined,
        })
      ).unwrap();
      onClose();
    } catch (error) {
      console.error('Failed to create chat:', error);
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const baseUsers = filteredUsers.filter((u) => u.id !== currentUserId);

  const isFriend = (userId: string) => friends.some((f) => f.id === userId);
  const isSelectable = (userId: string) => userId === WA_USER_ID || isFriend(userId);

  const waUser: User = {
    id: WA_USER_ID,
    handle: 'assistant_1003',
    displayName: t('Wa'),
    avatarUrl: '',
    gender: 'female',
    bio: 'AI assistant',
    isOnline: true,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const listWithWa = baseUsers.some((u) => u.id === WA_USER_ID)
    ? baseUsers
    : [waUser, ...baseUsers];

  const selectedDirectTarget = selectedUsers.length === 1 ? selectedUsers[0] : null;
  const canCreateDirect = !!selectedDirectTarget && isSelectable(selectedDirectTarget.id);
  const canCreateGroup = selectedUsers.length > 1 && selectedUsers.every((u) => isSelectable(u.id));
  const canCreateChat = canCreateDirect || canCreateGroup;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('chat.new.title')}</DialogTitle>
      <DialogContent>
        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {selectedUsers.map((user) => (
              <Chip
                key={user.id}
                avatar={<UserAvatar src={user.avatarUrl} gender={user.gender} fallbackText={user.displayName} />}
                label={user.displayName}
                onDelete={() => handleSelectUser(user)}
                deleteIcon={<CloseIcon />}
              />
            ))}
          </BoxAny>
        )}

        {/* Search */}
        <TextField
          fullWidth
          placeholder={t('common.searchUsers')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {/* User List */}
        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : listWithWa.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            {t('common.noUsersFound')}
          </Typography>
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {listWithWa.map((user) => (
              <ListItemButton
                key={user.id}
                onClick={() => handleSelectUser(user)}
                selected={selectedUsers.some((u) => u.id === user.id)}
                disabled={!isSelectable(user.id)}
              >
                <ListItemAvatar>
                  <UserAvatar src={user.avatarUrl} gender={user.gender} fallbackText={user.displayName} />
                </ListItemAvatar>
                <ListItemText
                  primary={user.displayName}
                  secondary={
                    user.id === WA_USER_ID
                      ? t('chat.new.alwaysAvailable')
                      : isFriend(user.id)
                        ? (user.handle ? `@${user.handle} · ${t('contacts.friend')}` : t('contacts.friend'))
                        : (user.handle ? `@${user.handle} · ${t('contacts.notFriend')}` : t('contacts.notFriend'))
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleCreateChat}
          disabled={!canCreateChat || creating}
        >
          {creating ? <CircularProgress size={24} /> : t('chat.new.start')}
        </Button>
      </DialogActions>
      {selectedDirectTarget && !canCreateDirect && (
        <BoxAny sx={{ px: 3, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('chat.new.onlyFriendsDirect')}
          </Typography>
        </BoxAny>
      )}
    </Dialog>
  );
};
