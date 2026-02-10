using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class MessageRepository : IMessageRepository
{
    private readonly IMongoCollection<Message> _collection;

    public MessageRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Messages"] ?? "Messages";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<Message>(collectionName);
    }

    public async Task<Message?> GetByIdAsync(string id, string chatId)
    {
        var filter = Builders<Message>.Filter.And(
            Builders<Message>.Filter.Eq(m => m.Id, id),
            Builders<Message>.Filter.Eq(m => m.ChatId, chatId)
        );

        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<List<Message>> GetChatMessagesAsync(string chatId, int limit = 50, DateTime? before = null)
    {
        var filterBuilder = Builders<Message>.Filter;
        var filter = filterBuilder.And(
            filterBuilder.Eq(m => m.ChatId, chatId),
            filterBuilder.Eq(m => m.Type, "message"),
            filterBuilder.Eq(m => m.IsDeleted, false)
        );

        if (before.HasValue)
        {
            filter = filterBuilder.And(filter, filterBuilder.Lt(m => m.Timestamp, before.Value));
        }

        var sort = Builders<Message>.Sort.Descending(m => m.Timestamp);

        var messages = await _collection.Find(filter)
            .Sort(sort)
            .Limit(limit)
            .ToListAsync();

        // Reverse to get chronological order (oldest first)
        messages.Reverse();
        return messages;
    }

    public async Task<Message> CreateAsync(Message message)
    {
        message.Timestamp = DateTime.UtcNow;
        await _collection.InsertOneAsync(message);
        return message;
    }

    public async Task<Message> UpdateAsync(Message message)
    {
        var filter = Builders<Message>.Filter.And(
            Builders<Message>.Filter.Eq(m => m.Id, message.Id),
            Builders<Message>.Filter.Eq(m => m.ChatId, message.ChatId)
        );

        await _collection.ReplaceOneAsync(filter, message);
        return message;
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
