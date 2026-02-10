using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class ChatRepository : IChatRepository
{
    private readonly IMongoCollection<Chat> _collection;

    public ChatRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Chats"] ?? "Chats";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<Chat>(collectionName);
    }

    public async Task<Chat?> GetByIdAsync(string id)
    {
        var filter = Builders<Chat>.Filter.Eq(c => c.Id, id);
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<List<Chat>> GetUserChatsAsync(string userId)
    {
        var filter = Builders<Chat>.Filter.And(
            Builders<Chat>.Filter.Eq(c => c.Type, "chat"),
            Builders<Chat>.Filter.ElemMatch(c => c.Participants,
                p => p.UserId == userId && (!p.IsHidden || p.IsHidden == false))
        );

        var sort = Builders<Chat>.Sort.Descending(c => c.UpdatedAt);

        return await _collection.Find(filter)
            .Sort(sort)
            .ToListAsync();
    }

    public async Task<Chat?> GetDirectChatAsync(string userId1, string userId2)
    {
        var filter = Builders<Chat>.Filter.And(
            Builders<Chat>.Filter.Eq(c => c.Type, "chat"),
            Builders<Chat>.Filter.Eq(c => c.ChatType, "direct"),
            Builders<Chat>.Filter.ElemMatch(c => c.Participants, p => p.UserId == userId1),
            Builders<Chat>.Filter.ElemMatch(c => c.Participants, p => p.UserId == userId2)
        );

        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<Chat> CreateAsync(Chat chat)
    {
        chat.CreatedAt = DateTime.UtcNow;
        chat.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(chat);
        return chat;
    }

    public async Task<Chat> UpdateAsync(Chat chat)
    {
        chat.UpdatedAt = DateTime.UtcNow;
        var filter = Builders<Chat>.Filter.Eq(c => c.Id, chat.Id);
        await _collection.ReplaceOneAsync(filter, chat);
        return chat;
    }

    public async Task SetHiddenAsync(string chatId, string userId, bool isHidden)
    {
        var chat = await GetByIdAsync(chatId);
        if (chat == null) return;

        var idx = chat.Participants.FindIndex(p => p.UserId == userId);
        if (idx < 0) return;

        chat.Participants[idx].IsHidden = isHidden;

        var filter = Builders<Chat>.Filter.Eq(c => c.Id, chatId);
        await _collection.ReplaceOneAsync(filter, chat);
    }

    public async Task ClearChatForUserAsync(string chatId, string userId, DateTime clearedAtUtc)
    {
        var chat = await GetByIdAsync(chatId);
        if (chat == null) return;

        var idx = chat.Participants.FindIndex(p => p.UserId == userId);
        if (idx < 0) return;

        chat.Participants[idx].IsHidden = true;
        chat.Participants[idx].ClearedAt = clearedAtUtc;

        var filter = Builders<Chat>.Filter.Eq(c => c.Id, chatId);
        await _collection.ReplaceOneAsync(filter, chat);
    }

    public async Task PatchParticipantProfileAsync(
        string chatId,
        int participantIndex,
        string displayName,
        string avatarUrl,
        string gender)
    {
        if (participantIndex < 0) return;

        var chat = await GetByIdAsync(chatId);
        if (chat == null || participantIndex >= chat.Participants.Count) return;

        chat.Participants[participantIndex].DisplayName = displayName ?? string.Empty;
        chat.Participants[participantIndex].AvatarUrl = avatarUrl ?? string.Empty;
        chat.Participants[participantIndex].Gender = gender ?? "male";

        var filter = Builders<Chat>.Filter.Eq(c => c.Id, chatId);
        await _collection.ReplaceOneAsync(filter, chat);
    }

    public async Task DeleteAsync(string id)
    {
        var filter = Builders<Chat>.Filter.Eq(c => c.Id, id);
        await _collection.DeleteOneAsync(filter);
    }
}
