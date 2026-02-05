import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { notificationService, NotificationDto } from '@/services/notification.service';

interface NotificationsState {
  unreadCount: number;
  items: NotificationDto[];
  loading: boolean;
  error: string | null;
}

const initialState: NotificationsState = {
  unreadCount: 0,
  items: [],
  loading: false,
  error: null,
};

export const fetchUnreadNotificationCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async () => {
    return await notificationService.getUnreadCount();
  }
);

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (args: { unreadOnly?: boolean; limit?: number; before?: string } | undefined) => {
    return await notificationService.getNotifications(args);
  }
);

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    incrementUnread: (state, action: PayloadAction<number | undefined>) => {
      state.unreadCount += action.payload ?? 1;
    },
    setUnreadCount: (state, action: PayloadAction<number>) => {
      state.unreadCount = action.payload;
    },
    addNotification: (state, action: PayloadAction<NotificationDto>) => {
      const exists = state.items.some((n) => n.id === action.payload.id);
      if (!exists) state.items.unshift(action.payload);
      if (!action.payload.isRead) state.unreadCount += 1;
    },
    markAllReadLocal: (state) => {
      state.unreadCount = 0;
      state.items = state.items.map((n) => ({ ...n, isRead: true }));
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnreadNotificationCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch notifications';
      });
  },
});

export const {
  incrementUnread,
  setUnreadCount,
  addNotification,
  markAllReadLocal,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
