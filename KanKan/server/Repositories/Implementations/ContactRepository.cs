using Microsoft.Azure.Cosmos;
using WeChat.API.Models.Entities;
using WeChat.API.Repositories.Interfaces;

namespace WeChat.API.Repositories.Implementations;

public class ContactRepository : IContactRepository
{
    private readonly Container _container;

    public ContactRepository(CosmosClient cosmosClient, IConfiguration configuration)
    {
        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "WeChatDB";
        var containerName = configuration["CosmosDb:Containers:Contacts"] ?? "Contacts";
        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<Contact?> GetByIdAsync(string id, string userId)
    {
        try
        {
            var response = await _container.ReadItemAsync<Contact>(id, new PartitionKey(userId));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<Contact?> GetByUserAndContactAsync(string userId, string contactId)
    {
        var query = new QueryDefinition(
            @"SELECT * FROM c
              WHERE c.type = 'contact'
              AND c.userId = @userId
              AND c.contactId = @contactId")
            .WithParameter("@userId", userId)
            .WithParameter("@contactId", contactId);

        var iterator = _container.GetItemQueryIterator<Contact>(query, requestOptions: new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(userId)
        });

        var results = await iterator.ReadNextAsync();
        return results.FirstOrDefault();
    }

    public async Task<List<Contact>> GetContactsByStatusAsync(string userId, string status)
    {
        var query = new QueryDefinition(
            @"SELECT * FROM c
              WHERE c.type = 'contact'
              AND c.userId = @userId
              AND c.status = @status
              ORDER BY c.addedAt DESC")
            .WithParameter("@userId", userId)
            .WithParameter("@status", status);

        var iterator = _container.GetItemQueryIterator<Contact>(query, requestOptions: new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(userId)
        });

        var results = new List<Contact>();
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<Contact> UpsertAsync(Contact contact)
    {
        var response = await _container.UpsertItemAsync(contact, new PartitionKey(contact.UserId));
        return response.Resource;
    }

    public async Task DeleteAsync(string id, string userId)
    {
        await _container.DeleteItemAsync<Contact>(id, new PartitionKey(userId));
    }
}
