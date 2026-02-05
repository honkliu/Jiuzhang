using Microsoft.Azure.Cosmos;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class NotificationRepository : INotificationRepository
{
    private readonly Container _container;

    public NotificationRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "KanKanDB";
        var containerName = configuration["CosmosDb:Containers:Notifications"] ?? "Notifications";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<List<Notification>> GetUserNotificationsAsync(string userId, bool unreadOnly = false, int limit = 50, DateTime? before = null)
    {
        var queryText = @"SELECT * FROM c
WHERE c.userId = @userId AND c.type = 'notification'";

        if (unreadOnly)
        {
            queryText += " AND (NOT IS_DEFINED(c.isRead) OR c.isRead = false)";
        }

        if (before.HasValue)
        {
            queryText += " AND c.createdAt < @before";
        }

        queryText += " ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit";

        var query = new QueryDefinition(queryText)
            .WithParameter("@userId", userId)
            .WithParameter("@limit", limit);

        if (before.HasValue)
        {
            query = query.WithParameter("@before", before.Value);
        }

        var iterator = _container.GetItemQueryIterator<Notification>(query, requestOptions: new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(userId)
        });

        var results = new List<Notification>();
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<int> GetUnreadCountAsync(string userId)
    {
        var query = new QueryDefinition(@"SELECT VALUE COUNT(1) FROM c
WHERE c.userId = @userId AND c.type = 'notification' AND (NOT IS_DEFINED(c.isRead) OR c.isRead = false)")
            .WithParameter("@userId", userId);

        var iterator = _container.GetItemQueryIterator<int>(query, requestOptions: new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(userId)
        });

        var total = 0;
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            total += response.Resource.FirstOrDefault();
        }

        return total;
    }

    public async Task<Notification> CreateAsync(Notification notification)
    {
        if (notification.CreatedAt == default)
            notification.CreatedAt = DateTime.UtcNow;

        var response = await _container.CreateItemAsync(notification, new PartitionKey(notification.UserId));
        return response.Resource;
    }

    public async Task MarkReadAsync(string userId, string notificationId)
    {
        try
        {
            await _container.PatchItemAsync<Notification>(
                id: notificationId,
                partitionKey: new PartitionKey(userId),
                patchOperations: new List<PatchOperation>
                {
                    PatchOperation.Set("/isRead", true),
                    PatchOperation.Set("/readAt", DateTime.UtcNow)
                });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // no-op
        }
    }

    public async Task MarkAllReadAsync(string userId)
    {
        // Cosmos doesn't support a simple bulk patch. We read a page of unread notifications and patch them.
        var unread = await GetUserNotificationsAsync(userId, unreadOnly: true, limit: 200);
        foreach (var n in unread)
        {
            await MarkReadAsync(userId, n.Id);
        }
    }
}
