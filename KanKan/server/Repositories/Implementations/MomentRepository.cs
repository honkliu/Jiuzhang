using Microsoft.Azure.Cosmos;
using WeChat.API.Models.Entities;
using WeChat.API.Repositories.Interfaces;

namespace WeChat.API.Repositories.Implementations;

public class MomentRepository : IMomentRepository
{
    private readonly Container _container;

    public MomentRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "WeChatDB";
        var containerName = configuration["CosmosDb:Containers:Moments"] ?? "Moments";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<Moment?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _container.ReadItemAsync<Moment>(id, new PartitionKey(id));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<Moment>> GetFeedAsync(int limit = 50, DateTime? before = null)
    {
        var queryText = @"SELECT * FROM c
            WHERE c.type = 'moment'";

        if (before.HasValue)
        {
            queryText += " AND c.createdAt < @before";
        }

        queryText += " ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit";

        var query = new QueryDefinition(queryText)
            .WithParameter("@limit", limit);

        if (before.HasValue)
        {
            query = query.WithParameter("@before", before.Value);
        }

        var iterator = _container.GetItemQueryIterator<Moment>(query);
        var results = new List<Moment>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<Moment> CreateAsync(Moment moment)
    {
        moment.CreatedAt = DateTime.UtcNow;
        var response = await _container.CreateItemAsync(moment, new PartitionKey(moment.Id));
        return response.Resource;
    }

    public async Task<Moment> UpdateAsync(Moment moment)
    {
        var response = await _container.ReplaceItemAsync(moment, moment.Id, new PartitionKey(moment.Id));
        return response.Resource;
    }

    public async Task DeleteAsync(string id)
    {
        await _container.DeleteItemAsync<Moment>(id, new PartitionKey(id));
    }
}
