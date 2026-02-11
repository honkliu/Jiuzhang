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
  const currentUserId = useSelector((state: RootState) => state.auth.user?.id);
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
        contactService.getAllUsers(),
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
                      secondary={req.fromUser.email}
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
                        </BoxAny>
                      }
                      secondary={`${user.email} · ${t('contacts.friend')}`}
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
                    <Button
                      variant="outlined"
                      onClick={() => handleAddFriend(user.id)}
                      disabled={actionLoading === user.id}
                    >
                      {t('contacts.addFriend')}
                    </Button>
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
                        </BoxAny>
                      }
                      secondary={`${user.email} · ${t('contacts.notFriend')}`}
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
