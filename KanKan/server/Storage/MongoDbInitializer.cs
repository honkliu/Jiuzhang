using MongoDB.Driver;

namespace KanKan.API.Storage;

public class MongoDbInitializer : IHostedService
{
    private readonly IMongoClient _mongoClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MongoDbInitializer> _logger;

    public MongoDbInitializer(IMongoClient mongoClient, IConfiguration configuration, ILogger<MongoDbInitializer> logger)
    {
        _mongoClient = mongoClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var enabled = _configuration.GetValue<bool>("MongoDB:Initialization:Enabled", false);
        if (!enabled)
        {
            _logger.LogInformation("MongoDB initialization disabled.");
            return;
        }

        var databaseName = _configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var database = _mongoClient.GetDatabase(databaseName);

        _logger.LogInformation("Initializing MongoDB database: {DatabaseName}", databaseName);

        // Create collections if they don't exist
        var collectionNames = new[]
        {
            _configuration["MongoDB:Collections:Users"] ?? "Users",
            _configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup",
            _configuration["MongoDB:Collections:Messages"] ?? "Messages",
            _configuration["MongoDB:Collections:Chats"] ?? "Chats",
            _configuration["MongoDB:Collections:ChatUsers"] ?? "ChatUsers",
            _configuration["MongoDB:Collections:Contacts"] ?? "Contacts",
            _configuration["MongoDB:Collections:Moments"] ?? "Moments",
            _configuration["MongoDB:Collections:EmailVerifications"] ?? "EmailVerifications",
            _configuration["MongoDB:Collections:Notifications"] ?? "Notifications"
        };

        var existingCollections = await (await database.ListCollectionNamesAsync(cancellationToken: cancellationToken))
            .ToListAsync(cancellationToken: cancellationToken);

        foreach (var collectionName in collectionNames)
        {
            if (!existingCollections.Contains(collectionName))
            {
                await database.CreateCollectionAsync(collectionName, cancellationToken: cancellationToken);
                _logger.LogInformation("Created collection: {CollectionName}", collectionName);
            }
        }

        // Create indexes for better query performance
        await CreateIndexesAsync(database, cancellationToken);

        _logger.LogInformation("MongoDB initialization completed successfully.");
    }

    private async Task CreateIndexesAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        // Users collection indexes
        var usersCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:Users"] ?? "Users");

        await usersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("email"),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        await usersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("handle"),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        // UserEmailLookup collection indexes
        var emailLookupCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup");

        await emailLookupCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("email"),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        // Messages collection indexes
        var messagesCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:Messages"] ?? "Messages");

        await messagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("chatId").Descending("timestamp")),
            cancellationToken: cancellationToken);

        // ChatUsers collection indexes
        var chatUsersCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:ChatUsers"] ?? "ChatUsers");

        await chatUsersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("userId").Descending("updatedAt")),
            cancellationToken: cancellationToken);

        // Contacts collection indexes
        var contactsCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:Contacts"] ?? "Contacts");

        await contactsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("userId").Ascending("contactId")),
            cancellationToken: cancellationToken);

        // Moments collection indexes
        var momentsCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:Moments"] ?? "Moments");

        await momentsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("userId").Descending("createdAt")),
            cancellationToken: cancellationToken);

        // EmailVerifications collection - with TTL index
        var emailVerificationsCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:EmailVerifications"] ?? "EmailVerifications");

        await emailVerificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("email")),
            cancellationToken: cancellationToken);

        await emailVerificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("expiresAt"),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }),
            cancellationToken: cancellationToken);

        // Notifications collection - with TTL index
        var notificationsCollection = database.GetCollection<MongoDB.Bson.BsonDocument>(
            _configuration["MongoDB:Collections:Notifications"] ?? "Notifications");

        await notificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("userId").Descending("createdAt")),
            cancellationToken: cancellationToken);

        await notificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("expiresAt"),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }),
            cancellationToken: cancellationToken);

        _logger.LogInformation("Created indexes for all collections.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
