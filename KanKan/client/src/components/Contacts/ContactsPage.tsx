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
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AppDispatch } from '@/store';
import { contactService, User, FriendRequest } from '@/services/contact.service';
import { createChat } from '@/store/chatSlice';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { useLanguage } from '@/i18n/LanguageContext';

export const ContactsPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { t } = useLanguage();
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, flexGrow: 1, pt: 10 }} maxWidth="md">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Contacts
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Button variant="contained" onClick={handleChatWithWa}>
            {t('Wa')}
          </Button>
        </Box>

        <TextField
          fullWidth
          placeholder="Search users by name or email..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          sx={{ mb: 2 }}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              Friend Requests
            </Typography>
            {requests.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No pending requests.
              </Typography>
            ) : (
              <List sx={{ mb: 2 }}>
                {requests.map((req) => (
                  <ListItem
                    key={req.id}
                    divider
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          onClick={() => handleAccept(req.fromUserId)}
                          disabled={actionLoading === req.fromUserId}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => handleReject(req.fromUserId)}
                          disabled={actionLoading === req.fromUserId}
                        >
                          Reject
                        </Button>
                      </Box>
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
              Contacts
            </Typography>
            {contacts.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No contacts yet.
              </Typography>
            ) : (
              <List sx={{ mb: 2 }}>
                {contacts.map((user) => (
                  <ListItem key={user.id} divider secondaryAction={
                    <Button variant="contained" onClick={() => handleStartChat(user.id)}>
                      Chat
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{user.displayName}</Typography>
                          {user.isOnline && <Chip size="small" color="success" label="Online" />}
                        </Box>
                      }
                      secondary={user.email}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              Discover Users
            </Typography>
            {users.length === 0 ? (
              <Typography color="text.secondary">No users found.</Typography>
            ) : (
              <List>
                {users.map((user) => (
                  <ListItem key={user.id} divider secondaryAction={
                    isContact(user.id) ? (
                      <Button variant="contained" onClick={() => handleStartChat(user.id)}>
                        Chat
                      </Button>
                    ) : (
                      <Button
                        variant="outlined"
                        onClick={() => handleAddFriend(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        Add Friend
                      </Button>
                    )
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{user.displayName}</Typography>
                          {user.isOnline && <Chip size="small" color="success" label="Online" />}
                        </Box>
                      }
                      secondary={user.email}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </Container>
    </Box>
  );
};
