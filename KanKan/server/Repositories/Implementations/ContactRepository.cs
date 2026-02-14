using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class ContactRepository : IContactRepository
{
    private readonly IMongoCollection<Contact> _collection;

    public ContactRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Contacts"] ?? "Contacts";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<Contact>(collectionName);
    }

    public async Task<Contact?> GetByIdAsync(string id, string userId)
    {
        var filter = Builders<Contact>.Filter.And(
            Builders<Contact>.Filter.Eq(c => c.Id, id),
            Builders<Contact>.Filter.Eq(c => c.UserId, userId)
        );
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<Contact?> GetByUserAndContactAsync(string userId, string contactId)
    {
        var filter = Builders<Contact>.Filter.And(
            Builders<Contact>.Filter.Eq(c => c.Type, "contact"),
            Builders<Contact>.Filter.Eq(c => c.UserId, userId),
            Builders<Contact>.Filter.Eq(c => c.ContactId, contactId)
        );
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<List<Contact>> GetContactsByStatusAsync(string userId, string status)
    {
        var filter = Builders<Contact>.Filter.And(
            Builders<Contact>.Filter.Eq(c => c.Type, "contact"),
            Builders<Contact>.Filter.Eq(c => c.UserId, userId),
            Builders<Contact>.Filter.Eq(c => c.Status, status)
        );
        var sort = Builders<Contact>.Sort.Descending(c => c.AddedAt);
        return await _collection.Find(filter).Sort(sort).ToListAsync();
    }

    public async Task<Contact> UpsertAsync(Contact contact)
    {
        var filter = Builders<Contact>.Filter.Eq(c => c.Id, contact.Id);
        var options = new ReplaceOptions { IsUpsert = true };
        await _collection.ReplaceOneAsync(filter, contact, options);
        return contact;
    }

    public async Task DeleteAsync(string id, string userId)
    {
        var filter = Builders<Contact>.Filter.And(
            Builders<Contact>.Filter.Eq(c => c.Id, id),
            Builders<Contact>.Filter.Eq(c => c.UserId, userId)
        );
        await _collection.DeleteOneAsync(filter);
    }

    public async Task DeleteAllForUserAsync(string userId)
    {
        var filter = Builders<Contact>.Filter.Or(
            Builders<Contact>.Filter.Eq(c => c.UserId, userId),
            Builders<Contact>.Filter.Eq(c => c.ContactId, userId)
        );

        await _collection.DeleteManyAsync(filter);
    }
}
