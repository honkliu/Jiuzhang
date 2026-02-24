import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Button,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AppDispatch, RootState } from '@/store';
import { contactService, User, FriendRequest } from '@/services/contact.service';
import { adminService } from '@/services/admin.service';
import { createChat } from '@/store/chatSlice';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const ContactsPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const currentUserId = currentUser?.id;
  const isAdmin = Boolean(currentUser?.isAdmin);
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [allUsers, contactsData, requestsData] = await Promise.all([
        isAdmin ? adminService.getUsers() : contactService.getAllUsers(),
        contactService.getContacts(),
        contactService.getFriendRequests(),
      ]);
      setUsers(allUsers);
      setContacts(contactsData);
      setRequests(requestsData);
    } finally {
      setLoading(false);
    }
  };

  const handleChatWithWa = async () => {
    await dispatch(
      createChat({ participantIds: ['user_ai_wa'], chatType: 'direct' })
    ).unwrap();

    navigate('/chats');
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      setLoading(true);
      try {
        const results = await contactService.searchUsers(query);
        setUsers(results);
      } finally {
        setLoading(false);
      }
    } else if (query.length === 0) {
      loadUsers();
    }
  };

  const handleStartChat = async (userId: string) => {
    const result = await dispatch(
      createChat({ participantIds: [userId], chatType: 'direct' })
    ).unwrap();

    navigate('/chats');
    if (result?.id) {
      // Chat will be active after createChat resolves
    }
  };

  const handleAddFriend = async (userId: string) => {
    setActionLoading(userId);
    try {
      await contactService.sendFriendRequest(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    const confirmed = window.confirm(t('contacts.removeConfirm'));
    if (!confirmed) return;

    setActionLoading(userId);
    try {
      await contactService.removeFriend(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, displayName?: string) => {
    const label = displayName || userId;
    const confirmed = window.confirm(
      t('contacts.deleteUserConfirm')
        .replace('{name}', label)
    );
    if (!confirmed) return;

    setActionLoading(userId);
    try {
      await adminService.deleteUser(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleDisabled = async (user: User) => {
    const label = user.displayName || user.id;
    const actionLabel = user.isDisabled ? t('contacts.enable') : t('contacts.disable');
    const confirmed = window.confirm(
      t('contacts.toggleDisableConfirm')
        .replace('{action}', actionLabel)
        .replace('{name}', label)
    );
    if (!confirmed) return;

    setActionLoading(user.id);
    try {
      if (user.isDisabled) {
        await adminService.enableUser(user.id);
      } else {
        await adminService.disableUser(user.id);
      }
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (fromUserId: string) => {
    setActionLoading(fromUserId);
    try {
      await contactService.acceptFriendRequest(fromUserId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (fromUserId: string) => {
    setActionLoading(fromUserId);
    try {
      await contactService.rejectFriendRequest(fromUserId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const isContact = (userId: string) => contacts.some((c) => c.id === userId);
  const otherUsers = users.filter(
    (user) => user.id !== currentUserId && !isContact(user.id)
  );

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, flexGrow: 1, pt: 10 }} maxWidth="md">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {t('contacts.title')}
        </Typography>

        <BoxAny sx={{ mb: 2 }}>
          <Button variant="contained" onClick={handleChatWithWa}>
            {t('Wa')}
          </Button>
        </BoxAny>

        <TextField
          fullWidth
          placeholder={t('common.searchUsers')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          sx={{ mb: 2 }}
        />

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : (
          <>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {t('contacts.friendRequests')}
            </Typography>
            {requests.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('contacts.noRequests')}
              </Typography>
            ) : (
              <List sx={{ mb: 2 }}>
                {requests.map((req) => (
                  <ListItem
                    key={req.id}
                    divider
                    secondaryAction={
                      <BoxAny sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          onClick={() => handleAccept(req.fromUserId)}
                          disabled={actionLoading === req.fromUserId}
                        >
                          {t('contacts.accept')}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => handleReject(req.fromUserId)}
                          disabled={actionLoading === req.fromUserId}
                        >
                          {t('contacts.reject')}
                        </Button>
                        {isAdmin && req.fromUserId !== currentUserId && (
                          <Button
                            variant="outlined"
                            color={req.fromUser.isDisabled ? 'success' : 'warning'}
                            onClick={() => handleToggleDisabled(req.fromUser)}
                            disabled={actionLoading === req.fromUserId}
                          >
                            {req.fromUser.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                          </Button>
                        )}
                        {isAdmin && req.fromUserId !== currentUserId && (
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => handleDeleteUser(req.fromUserId, req.fromUser.displayName)}
                            disabled={actionLoading === req.fromUserId}
                          >
                            {t('contacts.deleteUser')}
                          </Button>
                        )}
                      </BoxAny>
                    }
                  >
                    <ListItemAvatar>
                      <UserAvatar
                        src={req.fromUser.avatarUrl}
                        gender={req.fromUser.gender}
                        fallbackText={req.fromUser.displayName}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={req.fromUser.displayName}
                      secondary={req.fromUser.domain || ''}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {t('contacts.contacts')}
            </Typography>
            {contacts.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('contacts.noContacts')}
              </Typography>
            ) : (
              <List sx={{ mb: 2 }}>
                {contacts.map((user) => (
                  <ListItem key={user.id} divider secondaryAction={
                    <BoxAny sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" onClick={() => handleStartChat(user.id)}>
                        {t('contacts.chat')}
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleRemoveFriend(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        {t('contacts.removeFriend')}
                      </Button>
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          variant="outlined"
                          color={user.isDisabled ? 'success' : 'warning'}
                          onClick={() => handleToggleDisabled(user)}
                          disabled={actionLoading === user.id}
                        >
                          {user.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                        </Button>
                      )}
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => handleDeleteUser(user.id, user.displayName)}
                          disabled={actionLoading === user.id}
                        >
                          {t('contacts.deleteUser')}
                        </Button>
                      )}
                    </BoxAny>
                  }>
                    <ListItemAvatar>
                      <UserAvatar
                        src={user.avatarUrl}
                        gender={user.gender}
                        fallbackText={user.displayName}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{user.displayName}</Typography>
                          {user.isOnline && <Chip size="small" color="success" label={t('contacts.online')} />}
                          {user.isDisabled && <Chip size="small" color="warning" label={t('contacts.disabled')} />}
                        </BoxAny>
                      }
                      secondary={
                        user.domain
                          ? `${user.domain} · ${t('contacts.friend')}`
                          : t('contacts.friend')
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {t('contacts.others')}
            </Typography>
            {otherUsers.length === 0 ? (
              <Typography color="text.secondary">{t('contacts.noUsers')}</Typography>
            ) : (
              <List>
                {otherUsers.map((user) => (
                  <ListItem key={user.id} divider secondaryAction={
                    <BoxAny sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        onClick={() => handleAddFriend(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        {t('contacts.addFriend')}
                      </Button>
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          variant="outlined"
                          color={user.isDisabled ? 'success' : 'warning'}
                          onClick={() => handleToggleDisabled(user)}
                          disabled={actionLoading === user.id}
                        >
                          {user.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                        </Button>
                      )}
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => handleDeleteUser(user.id, user.displayName)}
                          disabled={actionLoading === user.id}
                        >
                          {t('contacts.deleteUser')}
                        </Button>
                      )}
                    </BoxAny>
                  }>
                    <ListItemAvatar>
                      <UserAvatar
                        src={user.avatarUrl}
                        gender={user.gender}
                        fallbackText={user.displayName}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{user.displayName}</Typography>
                          {user.isOnline && <Chip size="small" color="success" label={t('contacts.online')} />}
                          {user.isDisabled && <Chip size="small" color="warning" label={t('contacts.disabled')} />}
                        </BoxAny>
                      }
                      secondary={
                        user.domain
                          ? `${user.domain} · ${t('contacts.notFriend')}`
                          : t('contacts.notFriend')
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </Container>
    </BoxAny>
  );
};
