using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface INotificationRepository
{
    Task<List<Notification>> GetUserNotificationsAsync(string userId, bool unreadOnly = false, int limit = 50, DateTime? before = null);
    Task<int> GetUnreadCountAsync(string userId);
    Task<Notification> CreateAsync(Notification notification);
    Task MarkReadAsync(string userId, string notificationId);
    Task MarkAllReadAsync(string userId);
}
