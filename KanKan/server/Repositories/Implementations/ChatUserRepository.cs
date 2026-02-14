using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class ChatUserRepository : IChatUserRepository
{
    private readonly IMongoCollection<ChatUser> _collection;

    public ChatUserRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:ChatUsers"] ?? "ChatUsers";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<ChatUser>(collectionName);
    }

    public async Task<List<ChatUser>> GetUserChatsAsync(string userId, bool includeHidden = false)
    {
        var filterBuilder = Builders<ChatUser>.Filter;
        var filter = filterBuilder.And(
            filterBuilder.Eq(cu => cu.UserId, userId),
            filterBuilder.Eq(cu => cu.Type, "chat_user")
        );

        if (!includeHidden)
        {
            filter = filterBuilder.And(
                filter,
                filterBuilder.Or(
                    filterBuilder.Eq(cu => cu.IsHidden, false),
                    filterBuilder.Exists(cu => cu.IsHidden, false)
                )
            );
        }

        var sort = Builders<ChatUser>.Sort.Descending(cu => cu.UpdatedAt);

        return await _collection.Find(filter)
            .Sort(sort)
            .ToListAsync();
    }

    public async Task<ChatUser?> GetByUserAndChatAsync(string userId, string chatId)
    {
        var filter = Builders<ChatUser>.Filter.And(
            Builders<ChatUser>.Filter.Eq(cu => cu.UserId, userId),
            Builders<ChatUser>.Filter.Eq(cu => cu.ChatId, chatId)
        );

        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task UpsertAsync(ChatUser chatUser)
    {
        if (string.IsNullOrWhiteSpace(chatUser.Id))
        {
            chatUser.Id = BuildChatUserId(chatUser.ChatId, chatUser.UserId);
        }
        else if (!chatUser.Id.Contains(':'))
        {
            chatUser.Id = BuildChatUserId(chatUser.ChatId, chatUser.UserId);
        }

        var filter = Builders<ChatUser>.Filter.And(
            Builders<ChatUser>.Filter.Eq(cu => cu.UserId, chatUser.UserId),
            Builders<ChatUser>.Filter.Eq(cu => cu.ChatId, chatUser.ChatId)
        );

        await _collection.ReplaceOneAsync(
            filter,
            chatUser,
            new ReplaceOptions { IsUpsert = true }
        );
    }

    private static string BuildChatUserId(string chatId, string userId)
    {
        return $"{chatId}:{userId}";
    }

    public async Task UpsertManyAsync(IEnumerable<ChatUser> chatUsers)
    {
        var tasks = chatUsers.Select(chatUser => UpsertAsync(chatUser));
        await Task.WhenAll(tasks);
    }

    public async Task SetHiddenAsync(string userId, string chatId, bool isHidden)
    {
        var chatUser = await GetByUserAndChatAsync(userId, chatId);
        if (chatUser == null) return;

        chatUser.IsHidden = isHidden;
        await UpsertAsync(chatUser);
    }

    public async Task ClearChatForUserAsync(string userId, string chatId, DateTime clearedAtUtc)
    {
        var chatUser = await GetByUserAndChatAsync(userId, chatId);
        if (chatUser == null) return;

        chatUser.IsHidden = true;
        chatUser.ClearedAt = clearedAtUtc;
        await UpsertAsync(chatUser);
    }

    public async Task PatchParticipantProfileAsync(string userId, string chatId, int participantIndex, string displayName, string avatarUrl, string gender)
    {
        if (participantIndex < 0) return;

        var chatUser = await GetByUserAndChatAsync(userId, chatId);
        if (chatUser == null || chatUser.Participants == null || participantIndex >= chatUser.Participants.Count)
            return;

        chatUser.Participants[participantIndex].DisplayName = displayName ?? string.Empty;
        chatUser.Participants[participantIndex].AvatarUrl = avatarUrl ?? string.Empty;
        chatUser.Participants[participantIndex].Gender = gender ?? "male";

        await UpsertAsync(chatUser);
    }

    public async Task DeleteAsync(string userId, string chatId)
    {
        var filter = Builders<ChatUser>.Filter.And(
            Builders<ChatUser>.Filter.Eq(cu => cu.UserId, userId),
            Builders<ChatUser>.Filter.Eq(cu => cu.ChatId, chatId)
        );

        await _collection.DeleteOneAsync(filter);
    }

    public async Task DeleteAllForUserAsync(string userId)
    {
        var filter = Builders<ChatUser>.Filter.Eq(cu => cu.UserId, userId);
        await _collection.DeleteManyAsync(filter);
    }
}
