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
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { createChat } from '@/store/chatSlice';
import { contactService, User } from '@/services/contact.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
}

export const NewChatDialog: React.FC<NewChatDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
      const allUsers = await contactService.getAllUsers();
      setUsers(allUsers);
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
    if (selectedUsers.some((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;

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
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Chat</DialogTitle>
      <DialogContent>
        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {selectedUsers.map((user) => (
              <Chip
                key={user.id}
                avatar={<UserAvatar src={user.avatarUrl} gender={user.gender} fallbackText={user.displayName} />}
                label={user.displayName}
                onDelete={() => handleSelectUser(user)}
                deleteIcon={<CloseIcon />}
              />
            ))}
          </Box>
        )}

        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search users by name or email..."
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
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredUsers.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            No users found
          </Typography>
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredUsers.map((user) => (
              <ListItemButton
                key={user.id}
                onClick={() => handleSelectUser(user)}
                selected={selectedUsers.some((u) => u.id === user.id)}
              >
                <ListItemAvatar>
                  <UserAvatar src={user.avatarUrl} gender={user.gender} fallbackText={user.displayName} />
                </ListItemAvatar>
                <ListItemText
                  primary={user.displayName}
                  secondary={user.email}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreateChat}
          disabled={selectedUsers.length === 0 || creating}
        >
          {creating ? <CircularProgress size={24} /> : 'Start Chat'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
