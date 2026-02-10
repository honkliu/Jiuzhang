using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class NotificationRepository : INotificationRepository
{
    private readonly IMongoCollection<Notification> _collection;

    public NotificationRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Notifications"] ?? "Notifications";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<Notification>(collectionName);
    }

    public async Task<List<Notification>> GetUserNotificationsAsync(string userId, bool unreadOnly = false, int limit = 50, DateTime? before = null)
    {
        var filterBuilder = Builders<Notification>.Filter;
        var filter = filterBuilder.And(
            filterBuilder.Eq(n => n.UserId, userId),
            filterBuilder.Eq(n => n.Type, "notification")
        );

        if (unreadOnly)
        {
            filter = filterBuilder.And(
                filter,
                filterBuilder.Or(
                    filterBuilder.Exists(n => n.IsRead, false),
                    filterBuilder.Eq(n => n.IsRead, false)
                )
            );
        }

        if (before.HasValue)
        {
            filter = filterBuilder.And(
                filter,
                filterBuilder.Lt(n => n.CreatedAt, before.Value)
            );
        }

        var sort = Builders<Notification>.Sort.Descending(n => n.CreatedAt);
        return await _collection.Find(filter).Sort(sort).Limit(limit).ToListAsync();
    }

    public async Task<int> GetUnreadCountAsync(string userId)
    {
        var filterBuilder = Builders<Notification>.Filter;
        var filter = filterBuilder.And(
            filterBuilder.Eq(n => n.UserId, userId),
            filterBuilder.Eq(n => n.Type, "notification"),
            filterBuilder.Or(
                filterBuilder.Exists(n => n.IsRead, false),
                filterBuilder.Eq(n => n.IsRead, false)
            )
        );

        return (int)await _collection.CountDocumentsAsync(filter);
    }

    public async Task<Notification> CreateAsync(Notification notification)
    {
        if (notification.CreatedAt == default)
            notification.CreatedAt = DateTime.UtcNow;

        if (notification.Ttl.HasValue && notification.ExpiresAt == null)
        {
            notification.ExpiresAt = notification.CreatedAt.AddSeconds(notification.Ttl.Value);
        }

        await _collection.InsertOneAsync(notification);
        return notification;
    }

    public async Task MarkReadAsync(string userId, string notificationId)
    {
        var filter = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.Id, notificationId),
            Builders<Notification>.Filter.Eq(n => n.UserId, userId)
        );

        var notification = await _collection.Find(filter).FirstOrDefaultAsync();
        if (notification != null)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            await _collection.ReplaceOneAsync(filter, notification);
        }
    }

    public async Task MarkAllReadAsync(string userId)
    {
        // MongoDB doesn't support a simple bulk patch. We read a page of unread notifications and update them.
        var unread = await GetUserNotificationsAsync(userId, unreadOnly: true, limit: 200);
        foreach (var n in unread)
        {
            await MarkReadAsync(userId, n.Id);
        }
    }
}
