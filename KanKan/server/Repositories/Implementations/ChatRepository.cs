using Microsoft.Azure.Cosmos;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class ChatRepository : IChatRepository
{
    private readonly Container _container;

    public ChatRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "KanKanDB";
        var containerName = configuration["CosmosDb:Containers:Chats"] ?? "Chats";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<Chat?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _container.ReadItemAsync<Chat>(id, new PartitionKey(id));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<Chat>> GetUserChatsAsync(string userId)
    {
                var query = new QueryDefinition(
                    @"SELECT VALUE c FROM c
                            JOIN p IN c.participants
                            WHERE c.type = 'chat'
                            AND p.userId = @userId
                            AND (NOT IS_DEFINED(p.isHidden) OR p.isHidden = false)
                            ORDER BY c.updatedAt DESC"
                ).WithParameter("@userId", userId);

        var iterator = _container.GetItemQueryIterator<Chat>(query);
        var results = new List<Chat>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<Chat?> GetDirectChatAsync(string userId1, string userId2)
    {
        var query = new QueryDefinition(
            @"SELECT * FROM c
              WHERE c.type = 'chat'
              AND c.chatType = 'direct'
              AND ARRAY_CONTAINS(c.participants, {'userId': @userId1}, true)
              AND ARRAY_CONTAINS(c.participants, {'userId': @userId2}, true)"
        )
        .WithParameter("@userId1", userId1)
        .WithParameter("@userId2", userId2);

        var iterator = _container.GetItemQueryIterator<Chat>(query);
        var results = await iterator.ReadNextAsync();
        return results.FirstOrDefault();
    }

    public async Task<Chat> CreateAsync(Chat chat)
    {
        chat.CreatedAt = DateTime.UtcNow;
        chat.UpdatedAt = DateTime.UtcNow;
        var response = await _container.CreateItemAsync(chat, new PartitionKey(chat.Id));
        return response.Resource;
    }

    public async Task<Chat> UpdateAsync(Chat chat)
    {
        chat.UpdatedAt = DateTime.UtcNow;
        var response = await _container.ReplaceItemAsync(chat, chat.Id, new PartitionKey(chat.Id));
        return response.Resource;
    }

    public async Task SetHiddenAsync(string chatId, string userId, bool isHidden)
    {
        var chat = await GetByIdAsync(chatId);
        if (chat == null) return;

        var idx = chat.Participants.FindIndex(p => p.UserId == userId);
        if (idx < 0) return;

        await _container.PatchItemAsync<Chat>(
            id: chatId,
            partitionKey: new PartitionKey(chatId),
            patchOperations: new[]
            {
                PatchOperation.Set($"/participants/{idx}/isHidden", isHidden)
            }
        );
    }

    public async Task DeleteAsync(string id)
    {
        await _container.DeleteItemAsync<Chat>(id, new PartitionKey(id));
    }
}
