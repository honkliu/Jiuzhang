using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class MomentRepository : IMomentRepository
{
    private readonly IMongoCollection<Moment> _collection;

    public MomentRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:Moments"] ?? "Moments";
        var database = mongoClient.GetDatabase(databaseName);
        _collection = database.GetCollection<Moment>(collectionName);
    }

    public async Task<Moment?> GetByIdAsync(string id)
    {
        var filter = Builders<Moment>.Filter.Eq(m => m.Id, id);
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<List<Moment>> GetFeedAsync(int limit = 50, DateTime? before = null)
    {
        var filterBuilder = Builders<Moment>.Filter;
        var filter = filterBuilder.Eq(m => m.Type, "moment");

        if (before.HasValue)
        {
            filter = filterBuilder.And(
                filter,
                filterBuilder.Lt(m => m.CreatedAt, before.Value)
            );
        }

        var sort = Builders<Moment>.Sort.Descending(m => m.CreatedAt);
        return await _collection.Find(filter).Sort(sort).Limit(limit).ToListAsync();
    }

    public async Task<Moment> CreateAsync(Moment moment)
    {
        moment.CreatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(moment);
        return moment;
    }

    public async Task<Moment> UpdateAsync(Moment moment)
    {
        var filter = Builders<Moment>.Filter.Eq(m => m.Id, moment.Id);
        await _collection.ReplaceOneAsync(filter, moment);
        return moment;
    }

    public async Task DeleteAsync(string id)
    {
        var filter = Builders<Moment>.Filter.Eq(m => m.Id, id);
        await _collection.DeleteOneAsync(filter);
    }
}
