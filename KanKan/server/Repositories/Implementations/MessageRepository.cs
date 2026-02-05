using Microsoft.Azure.Cosmos;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class MessageRepository : IMessageRepository
{
    private readonly Container _container;

    public MessageRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "KanKanDB";
        var containerName = configuration["CosmosDb:Containers:Messages"] ?? "Messages";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<Message?> GetByIdAsync(string id, string chatId)
    {
        try
        {
            var response = await _container.ReadItemAsync<Message>(id, new PartitionKey(chatId));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<Message>> GetChatMessagesAsync(string chatId, int limit = 50, DateTime? before = null)
    {
        var queryText = @"SELECT * FROM c
              WHERE c.chatId = @chatId
              AND c.type = 'message'
              AND c.isDeleted = false";

        if (before.HasValue)
        {
            queryText += " AND c.timestamp < @before";
        }

        queryText += " ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit";

        var query = new QueryDefinition(queryText)
            .WithParameter("@chatId", chatId)
            .WithParameter("@limit", limit);

        if (before.HasValue)
        {
            query = query.WithParameter("@before", before.Value);
        }

        var iterator = _container.GetItemQueryIterator<Message>(query);
        var results = new List<Message>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        // Reverse to get chronological order (oldest first)
        results.Reverse();
        return results;
    }

    public async Task<Message> CreateAsync(Message message)
    {
        message.Timestamp = DateTime.UtcNow;
        var response = await _container.CreateItemAsync(message, new PartitionKey(message.ChatId));
        return response.Resource;
    }

    public async Task<Message> UpdateAsync(Message message)
    {
        var response = await _container.ReplaceItemAsync(
            message,
            message.Id,
            new PartitionKey(message.ChatId)
        );
        return response.Resource;
    }

    public async Task DeleteAsync(string id, string chatId)
    {
        var message = await GetByIdAsync(id, chatId);
        if (message != null)
        {
            message.IsDeleted = true;
            message.DeletedAt = DateTime.UtcNow;
            await UpdateAsync(message);
        }
    }
}
