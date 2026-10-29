using KanKan.API.Models.Entities.Homm;
using MongoDB.Bson;
using MongoDB.Driver;

namespace KanKan.API.Repositories.Homm;

/// <summary>Indexes for the HoMM collections; called from <c>MongoDbInitializer</c>.</summary>
public static class HommIndexes
{
    public static async Task CreateAsync(IMongoDatabase database, IConfiguration configuration, CancellationToken ct = default)
    {
        HommBson.Register();
        var games = database.GetCollection<BsonDocument>(HommCollections.Name(configuration, HommCollections.Games));
        await games.Indexes.CreateManyAsync(
        [
            Index("Players._id"), Index("Heroes._id"), Index("Towns._id"),
            Index("SharedProjects._id"), Index("TradeOffers._id"), Index("Players.UserId"), Index("State"),
        ], ct);

        async Task Social(string name, params string[] fields)
        {
            var c = database.GetCollection<BsonDocument>(HommCollections.Name(configuration, name));
            await c.Indexes.CreateManyAsync(fields.Select(Index), ct);
        }
        await Social(HommCollections.Posts, nameof(Post.TownId));
        await Social(HommCollections.Comments, nameof(Comment.PostId));
        await Social(HommCollections.WallMessages, nameof(WallMessage.TownId));
        await Social(HommCollections.TowerMessages, nameof(TowerMessage.TownId));
        await Social(HommCollections.ObeliskMessages, nameof(ObeliskMessage.GameId));
        await Social(HommCollections.MapAnnotations, nameof(MapAnnotation.GameId));
        await Social(HommCollections.HeroMessages, nameof(HeroMessage.GameId));
    }

    private static CreateIndexModel<BsonDocument> Index(string field) =>
        new(Builders<BsonDocument>.IndexKeys.Ascending(field));
}
