using Microsoft.Azure.Cosmos;
using KanKan.API.Repositories.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Repositories.Implementations;

public class UserRepository : IUserRepository
{
    private readonly Container _container;

    public UserRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "KanKanDB";
        var containerName = configuration["CosmosDb:Containers:Users"] ?? "Users";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<UserEntity?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _container.ReadItemAsync<UserEntity>(id, new PartitionKey(id));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<UserEntity?> GetByEmailAsync(string email)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email"
        ).WithParameter("@email", email.ToLower());

        var iterator = _container.GetItemQueryIterator<UserEntity>(query);
        var results = await iterator.ReadNextAsync();
        return results.FirstOrDefault();
    }

    public async Task<UserEntity?> GetByRefreshTokenAsync(string token)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.type = 'user' AND ARRAY_CONTAINS(c.refreshTokens, {'token': @token}, true)"
        ).WithParameter("@token", token);

        var iterator = _container.GetItemQueryIterator<UserEntity>(query);
        var results = await iterator.ReadNextAsync();
        return results.FirstOrDefault();
    }

    public async Task<UserEntity> CreateAsync(UserEntity user)
    {
        user.CreatedAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        var response = await _container.CreateItemAsync(user, new PartitionKey(user.Id));
        return response.Resource;
    }

    public async Task<UserEntity> UpdateAsync(UserEntity user)
    {
        user.UpdatedAt = DateTime.UtcNow;
        var response = await _container.ReplaceItemAsync(user, user.Id, new PartitionKey(user.Id));
        return response.Resource;
    }

    public async Task DeleteAsync(string id)
    {
        await _container.DeleteItemAsync<UserEntity>(id, new PartitionKey(id));
    }

    public async Task<List<UserEntity>> SearchUsersAsync(string query, string excludeUserId, int limit = 20)
    {
        var queryDefinition = new QueryDefinition(
            @"SELECT * FROM c
              WHERE c.type = 'user'
              AND c.id != @excludeUserId
              AND (CONTAINS(LOWER(c.email), @query) OR CONTAINS(LOWER(c.displayName), @query))
              ORDER BY c.displayName
              OFFSET 0 LIMIT @limit"
        )
        .WithParameter("@query", query.ToLower())
        .WithParameter("@excludeUserId", excludeUserId)
        .WithParameter("@limit", limit);

        var iterator = _container.GetItemQueryIterator<UserEntity>(queryDefinition);
        var results = new List<UserEntity>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<List<UserEntity>> GetAllUsersAsync(string excludeUserId, int limit = 100)
    {
        var queryDefinition = new QueryDefinition(
            @"SELECT * FROM c
              WHERE c.type = 'user'
              AND c.id != @excludeUserId
              ORDER BY c.displayName
              OFFSET 0 LIMIT @limit"
        )
        .WithParameter("@excludeUserId", excludeUserId)
        .WithParameter("@limit", limit);

        var iterator = _container.GetItemQueryIterator<UserEntity>(queryDefinition);
        var results = new List<UserEntity>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }
}
