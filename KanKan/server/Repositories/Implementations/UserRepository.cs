using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Repositories.Implementations;

public class UserRepository : IUserRepository
{
    private readonly IMongoCollection<UserEntity> _collection;
    private readonly IMongoCollection<UserEmailLookup> _emailLookupCollection;

    public UserRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Users"] ?? "Users";
        var emailLookupName = configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<UserEntity>(collectionName);
        _emailLookupCollection = database.GetCollection<UserEmailLookup>(emailLookupName);
    }

    public async Task<UserEntity?> GetByIdAsync(string id)
    {
        var filter = Builders<UserEntity>.Filter.Eq(u => u.Id, id);
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<UserEntity?> GetByEmailAsync(string email)
    {
        var normalized = email.ToLower();

        // Try to get from email lookup first
        var lookupFilter = Builders<UserEmailLookup>.Filter.Eq(l => l.Email, normalized);
        var lookup = await _emailLookupCollection.Find(lookupFilter).FirstOrDefaultAsync();

        if (lookup != null && !string.IsNullOrWhiteSpace(lookup.UserId))
        {
            return await GetByIdAsync(lookup.UserId);
        }

        // Fallback to direct query
        var filter = Builders<UserEntity>.Filter.And(
            Builders<UserEntity>.Filter.Eq(u => u.Type, "user"),
            Builders<UserEntity>.Filter.Eq(u => u.Email, normalized)
        );

        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<UserEntity?> GetByRefreshTokenAsync(string token)
    {
        var filter = Builders<UserEntity>.Filter.And(
            Builders<UserEntity>.Filter.Eq(u => u.Type, "user"),
            Builders<UserEntity>.Filter.ElemMatch(u => u.RefreshTokens, rt => rt.Token == token)
        );

        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<UserEntity> CreateAsync(UserEntity user)
    {
        user.CreatedAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(user);

        var lookup = new UserEmailLookup
        {
            Id = user.Email.ToLower(),
            Email = user.Email.ToLower(),
            UserId = user.Id,
            CreatedAt = DateTime.UtcNow
        };
        await _emailLookupCollection.ReplaceOneAsync(
            Builders<UserEmailLookup>.Filter.Eq(l => l.Email, lookup.Email),
            lookup,
            new ReplaceOptions { IsUpsert = true }
        );

        return user;
    }

    public async Task<UserEntity> UpdateAsync(UserEntity user)
    {
        user.UpdatedAt = DateTime.UtcNow;
        var filter = Builders<UserEntity>.Filter.Eq(u => u.Id, user.Id);
        await _collection.ReplaceOneAsync(filter, user);
        return user;
    }

    public async Task DeleteAsync(string id)
    {
        var user = await GetByIdAsync(id);
        var filter = Builders<UserEntity>.Filter.Eq(u => u.Id, id);
        await _collection.DeleteOneAsync(filter);

        if (user != null && !string.IsNullOrWhiteSpace(user.Email))
        {
            var email = user.Email.ToLower();
            var emailFilter = Builders<UserEmailLookup>.Filter.Eq(l => l.Email, email);
            await _emailLookupCollection.DeleteOneAsync(emailFilter);
        }
    }

    public async Task<List<UserEntity>> SearchUsersAsync(string query, string excludeUserId, int limit = 20)
    {
        var lowerQuery = query.ToLower();
        var filter = Builders<UserEntity>.Filter.And(
            Builders<UserEntity>.Filter.Eq(u => u.Type, "user"),
            Builders<UserEntity>.Filter.Ne(u => u.Id, excludeUserId),
            Builders<UserEntity>.Filter.Or(
                Builders<UserEntity>.Filter.Regex(u => u.Email, new MongoDB.Bson.BsonRegularExpression(lowerQuery, "i")),
                Builders<UserEntity>.Filter.Regex(u => u.DisplayName, new MongoDB.Bson.BsonRegularExpression(lowerQuery, "i"))
            )
        );

        var sort = Builders<UserEntity>.Sort.Ascending(u => u.DisplayName);

        return await _collection.Find(filter)
            .Sort(sort)
            .Limit(limit)
            .ToListAsync();
    }

    public async Task<List<UserEntity>> GetAllUsersAsync(string excludeUserId, int limit = 100)
    {
        var filter = Builders<UserEntity>.Filter.And(
            Builders<UserEntity>.Filter.Eq(u => u.Type, "user"),
            Builders<UserEntity>.Filter.Ne(u => u.Id, excludeUserId)
        );

        var sort = Builders<UserEntity>.Sort.Ascending(u => u.DisplayName);

        return await _collection.Find(filter)
            .Sort(sort)
            .Limit(limit)
            .ToListAsync();
    }
}
