using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class InMemoryNotificationRepository : INotificationRepository
{
    private static readonly Dictionary<string, Notification> _notifications = new();
    private static readonly object _lock = new();

    public Task<List<Notification>> GetUserNotificationsAsync(string userId, bool unreadOnly = false, int limit = 50, DateTime? before = null)
    {
        lock (_lock)
        {
            var query = _notifications.Values.Where(n => n.UserId == userId);

            if (unreadOnly)
                query = query.Where(n => !n.IsRead);

            if (before.HasValue)
                query = query.Where(n => n.CreatedAt < before.Value);

            var results = query
                .OrderByDescending(n => n.CreatedAt)
                .Take(limit)
                .ToList();

            return Task.FromResult(results);
        }
    }

    public Task<int> GetUnreadCountAsync(string userId)
    {
        lock (_lock)
        {
            var count = _notifications.Values.Count(n => n.UserId == userId && !n.IsRead);
            return Task.FromResult(count);
        }
    }

    public Task<Notification> CreateAsync(Notification notification)
    {
        lock (_lock)
        {
            if (notification.CreatedAt == default)
                notification.CreatedAt = DateTime.UtcNow;

            _notifications[notification.Id] = notification;
            return Task.FromResult(notification);
        }
    }

    public Task MarkReadAsync(string userId, string notificationId)
    {
        lock (_lock)
        {
            if (_notifications.TryGetValue(notificationId, out var n) && n.UserId == userId)
            {
                n.IsRead = true;
                n.ReadAt = DateTime.UtcNow;
            }
            return Task.CompletedTask;
        }
    }

    public Task MarkAllReadAsync(string userId)
    {
        lock (_lock)
        {
            foreach (var n in _notifications.Values.Where(n => n.UserId == userId && !n.IsRead))
            {
                n.IsRead = true;
                n.ReadAt = DateTime.UtcNow;
            }
            return Task.CompletedTask;
        }
    }
}
