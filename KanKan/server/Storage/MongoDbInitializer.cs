using MongoDB.Driver;
using KanKan.API.Domain;
using KanKan.API.Models;
using KanKan.API.Models.Entities;
using KanKan.API.Utils;
using Microsoft.AspNetCore.Hosting;

namespace KanKan.API.Storage;

public class MongoDbInitializer : IHostedService
{
    private readonly IMongoClient _mongoClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MongoDbInitializer> _logger;
    private readonly IWebHostEnvironment _environment;

    public MongoDbInitializer(
        IMongoClient mongoClient,
        IConfiguration configuration,
        ILogger<MongoDbInitializer> logger,
        IWebHostEnvironment environment)
    {
        _mongoClient = mongoClient;
        _configuration = configuration;
        _logger = logger;
        _environment = environment;
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
            _configuration["MongoDB:Collections:Notifications"] ?? "Notifications",
            _configuration["MongoDB:Collections:FamilyTrees"] ?? "FamilyTrees",
            _configuration["MongoDB:Collections:FamilyPersons"] ?? "FamilyPersons",
            _configuration["MongoDB:Collections:FamilyRelationships"] ?? "FamilyRelationships",
            _configuration["MongoDB:Collections:FamilyTreeVisibilities"] ?? "FamilyTreeVisibilities",
            "avatarImages",
            "imageGenerationJobs",
            _configuration["MongoDB:Collections:Receipts"] ?? "Receipts",
            _configuration["MongoDB:Collections:ReceiptVisits"] ?? "ReceiptVisits"
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
        await CreateFamilyIndexesAsync(database, cancellationToken);

        // Ensure the assistant user always exists for MongoDB mode.
        await EnsureAssistantUserAsync(database, cancellationToken);
        await SeedPredefinedAvatarsAsync(database, cancellationToken);
        await MigrateZodiacGeneratedAvatarsAsync(database, cancellationToken);

        _logger.LogInformation("MongoDB initialization completed successfully.");
    }

    private async Task CreateIndexesAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        // Users collection indexes
        var usersCollection = database.GetCollection<User>(
            _configuration["MongoDB:Collections:Users"] ?? "Users");

        await usersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Email),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        await usersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Handle),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        // UserEmailLookup collection indexes
        var emailLookupCollection = database.GetCollection<UserEmailLookup>(
            _configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup");

        // Remove legacy rows that would violate the unique index.
        await emailLookupCollection.DeleteManyAsync(
            Builders<UserEmailLookup>.Filter.Or(
                Builders<UserEmailLookup>.Filter.Eq(l => l.Email, null),
                Builders<UserEmailLookup>.Filter.Eq(l => l.Email, string.Empty)
            ),
            cancellationToken);

        // Drop legacy lowercase index if it exists (from older initializer runs).
        var emailLookupIndexesCursor = await emailLookupCollection.Indexes.ListAsync(cancellationToken);
        var emailLookupIndexes = await emailLookupIndexesCursor.ToListAsync(cancellationToken);
        if (emailLookupIndexes.Any(i => i["name"].AsString == "email_1"))
        {
            await emailLookupCollection.Indexes.DropOneAsync("email_1", cancellationToken);
        }

        await emailLookupCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<UserEmailLookup>(
                Builders<UserEmailLookup>.IndexKeys.Ascending(l => l.Email),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);

        // Messages collection indexes
        var messagesCollection = database.GetCollection<Message>(
            _configuration["MongoDB:Collections:Messages"] ?? "Messages");

        await messagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<Message>(
                Builders<Message>.IndexKeys.Ascending(m => m.ChatId).Descending(m => m.Timestamp)),
            cancellationToken: cancellationToken);

        // ChatUsers collection indexes
        var chatUsersCollection = database.GetCollection<ChatUser>(
            _configuration["MongoDB:Collections:ChatUsers"] ?? "ChatUsers");

        await chatUsersCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<ChatUser>(
                Builders<ChatUser>.IndexKeys.Ascending(cu => cu.UserId).Descending(cu => cu.UpdatedAt)),
            cancellationToken: cancellationToken);

        // Contacts collection indexes
        var contactsCollection = database.GetCollection<Contact>(
            _configuration["MongoDB:Collections:Contacts"] ?? "Contacts");

        await contactsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<Contact>(
                Builders<Contact>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.ContactId)),
            cancellationToken: cancellationToken);

        // Moments collection indexes
        var momentsCollection = database.GetCollection<Moment>(
            _configuration["MongoDB:Collections:Moments"] ?? "Moments");

        await momentsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<Moment>(
                Builders<Moment>.IndexKeys.Ascending(m => m.UserId).Descending(m => m.CreatedAt)),
            cancellationToken: cancellationToken);

        // EmailVerifications collection - with TTL index
        var emailVerificationsCollection = database.GetCollection<EmailVerification>(
            _configuration["MongoDB:Collections:EmailVerifications"] ?? "EmailVerifications");

        await emailVerificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<EmailVerification>(
                Builders<EmailVerification>.IndexKeys.Ascending(v => v.Email)),
            cancellationToken: cancellationToken);

        await emailVerificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<EmailVerification>(
                Builders<EmailVerification>.IndexKeys.Ascending(v => v.ExpiresAt),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }),
            cancellationToken: cancellationToken);

        // Notifications collection - with TTL index
        var notificationsCollection = database.GetCollection<Notification>(
            _configuration["MongoDB:Collections:Notifications"] ?? "Notifications");

        await notificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys.Ascending(n => n.UserId).Descending(n => n.CreatedAt)),
            cancellationToken: cancellationToken);

        await notificationsCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<Notification>(
                Builders<Notification>.IndexKeys.Ascending(n => n.ExpiresAt),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }),
            cancellationToken: cancellationToken);

        // AvatarImages collection indexes
        var avatarImagesCollection = database.GetCollection<AvatarImage>("avatarImages");

        await avatarImagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<AvatarImage>(
                Builders<AvatarImage>.IndexKeys
                    .Ascending(a => a.UserId)
                    .Ascending(a => a.ImageType)
                    .Ascending(a => a.Emotion)),
            cancellationToken: cancellationToken);

        await avatarImagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<AvatarImage>(
                Builders<AvatarImage>.IndexKeys
                    .Ascending(a => a.SourceAvatarId)
                    .Ascending(a => a.ImageType)
                    .Ascending(a => a.Emotion)),
            cancellationToken: cancellationToken);

        await avatarImagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<AvatarImage>(
                Builders<AvatarImage>.IndexKeys
                    .Ascending(a => a.UserId)
                    .Ascending(a => a.FileName)
                    .Ascending(a => a.ImageType)),
            cancellationToken: cancellationToken);

        // Optimized index for GetSelectableAvatars query
        await avatarImagesCollection.Indexes.CreateOneAsync(
            new CreateIndexModel<AvatarImage>(
                Builders<AvatarImage>.IndexKeys
                    .Ascending(a => a.ImageType)
                    .Ascending(a => a.Emotion)
                    .Ascending(a => a.SourceAvatarId)
                    .Ascending(a => a.UserId)
                    .Ascending(a => a.FileName)
                    .Descending(a => a.CreatedAt)),
            cancellationToken: cancellationToken);

        _logger.LogInformation("Created indexes for all collections.");
    }

    private async Task CreateFamilyIndexesAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var treesCol = database.GetCollection<FamilyTree>(
            _configuration["MongoDB:Collections:FamilyTrees"] ?? "FamilyTrees");
        await treesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTree>(
                Builders<FamilyTree>.IndexKeys.Ascending(t => t.Domain).Descending(t => t.UpdatedAt)),
            cancellationToken: cancellationToken);

        var personsCol = database.GetCollection<FamilyPerson>(
            _configuration["MongoDB:Collections:FamilyPersons"] ?? "FamilyPersons");
        await personsCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyPerson>(
                Builders<FamilyPerson>.IndexKeys.Ascending(p => p.TreeId)),
            cancellationToken: cancellationToken);
        await personsCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyPerson>(
                Builders<FamilyPerson>.IndexKeys.Ascending(p => p.TreeId).Ascending(p => p.Generation)),
            cancellationToken: cancellationToken);

        var relsCol = database.GetCollection<FamilyRelationship>(
            _configuration["MongoDB:Collections:FamilyRelationships"] ?? "FamilyRelationships");
        await relsCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyRelationship>(
                Builders<FamilyRelationship>.IndexKeys.Ascending(r => r.TreeId).Ascending(r => r.Type).Ascending(r => r.FromId)),
            cancellationToken: cancellationToken);
        await relsCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyRelationship>(
                Builders<FamilyRelationship>.IndexKeys.Ascending(r => r.TreeId).Ascending(r => r.Type).Ascending(r => r.ToId)),
            cancellationToken: cancellationToken);

        var visibilitiesCol = database.GetCollection<FamilyTreeVisibility>(
            _configuration["MongoDB:Collections:FamilyTreeVisibilities"] ?? "FamilyTreeVisibilities");
        await visibilitiesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTreeVisibility>(
                Builders<FamilyTreeVisibility>.IndexKeys.Ascending(v => v.TreeId),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: cancellationToken);
        await visibilitiesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTreeVisibility>(
                Builders<FamilyTreeVisibility>.IndexKeys.Ascending(v => v.UserViewers)),
            cancellationToken: cancellationToken);
        await visibilitiesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTreeVisibility>(
                Builders<FamilyTreeVisibility>.IndexKeys.Ascending(v => v.UserEditors)),
            cancellationToken: cancellationToken);
        await visibilitiesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTreeVisibility>(
                Builders<FamilyTreeVisibility>.IndexKeys.Ascending(v => v.DomainViewers)),
            cancellationToken: cancellationToken);
        await visibilitiesCol.Indexes.CreateOneAsync(
            new CreateIndexModel<FamilyTreeVisibility>(
                Builders<FamilyTreeVisibility>.IndexKeys.Ascending(v => v.DomainEditors)),
            cancellationToken: cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task SeedPredefinedAvatarsAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var avatarImagesCollection = database.GetCollection<AvatarImage>("avatarImages");
        var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var zodiacDir = Path.Combine(webRoot, "zodiac");

        if (!Directory.Exists(zodiacDir))
        {
            _logger.LogWarning("Predefined avatar directory not found: {Directory}", zodiacDir);
            return;
        }

        const string predefinedUserId = "system_predefined";
        var files = Directory.EnumerateFiles(zodiacDir, "*.*", SearchOption.TopDirectoryOnly)
            .Where(path => path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".webp", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var inserted = 0;
        foreach (var filePath in files)
        {
            var fileName = Path.GetFileName(filePath);
            var exists = await avatarImagesCollection
                .Find(a => a.UserId == predefinedUserId && a.FileName == fileName && a.ImageType == "original")
                .AnyAsync(cancellationToken);

            if (exists)
            {
                continue;
            }

            var imageData = await File.ReadAllBytesAsync(filePath, cancellationToken);
            var contentType = GetContentType(filePath);

            // Generate thumbnail (128x128 WebP)
            byte[] thumbnailData;
            string thumbnailContentType;
            try
            {
                thumbnailData = ImageResizer.GenerateThumbnail(imageData);
                thumbnailContentType = "image/webp";
                _logger.LogInformation("Generated thumbnail for {FileName}: {OriginalSize}KB -> {ThumbnailSize}KB",
                    fileName, imageData.Length / 1024, thumbnailData.Length / 1024);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to generate thumbnail for {FileName}, using original", fileName);
                thumbnailData = imageData;
                thumbnailContentType = contentType;
            }

            var avatarImage = new AvatarImage
            {
                UserId = predefinedUserId,
                ImageType = "original",
                Emotion = null,
                ImageData = imageData,
                ThumbnailData = thumbnailData,
                ThumbnailContentType = thumbnailContentType,
                ContentType = contentType,
                FileName = fileName,
                FileSize = imageData.LongLength,
                SourceAvatarId = null,
                GenerationPrompt = null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await avatarImagesCollection.InsertOneAsync(avatarImage, cancellationToken: cancellationToken);
            inserted++;
        }

        if (inserted > 0)
        {
            _logger.LogInformation("Seeded {Count} predefined avatars into MongoDB.", inserted);
        }
    }

    private async Task MigrateZodiacGeneratedAvatarsAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var avatarImagesCollection = database.GetCollection<AvatarImage>("avatarImages");
        const string predefinedUserId = "system_predefined";

        var predefinedAvatars = await avatarImagesCollection
            .Find(a => a.UserId == predefinedUserId && a.ImageType == "original")
            .Project(a => new { a.Id, a.FileName })
            .ToListAsync(cancellationToken);

        if (predefinedAvatars.Count == 0)
        {
            return;
        }

        var migrated = 0L;
        foreach (var predefined in predefinedAvatars)
        {
            if (string.IsNullOrWhiteSpace(predefined.FileName))
            {
                continue;
            }

            var legacyOriginalIds = await avatarImagesCollection
                .Find(a => a.ImageType == "original"
                    && a.UserId != predefinedUserId
                    && a.FileName == predefined.FileName)
                .Project(a => a.Id)
                .ToListAsync(cancellationToken);

            if (legacyOriginalIds.Count == 0)
            {
                continue;
            }

            var update = Builders<AvatarImage>.Update.Set(a => a.SourceAvatarId, predefined.Id);
            var filter = Builders<AvatarImage>.Filter.And(
                Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"),
                Builders<AvatarImage>.Filter.Eq(a => a.UserId, predefinedUserId),
                Builders<AvatarImage>.Filter.In(a => a.SourceAvatarId, legacyOriginalIds));

            var result = await avatarImagesCollection.UpdateManyAsync(filter, update, cancellationToken: cancellationToken);
            migrated += result.ModifiedCount;
        }

        if (migrated > 0)
        {
            _logger.LogInformation("Migrated {Count} generated avatars to predefined source ids.", migrated);
        }
    }

    private static string GetContentType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return extension switch
        {
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
    }

    private async Task EnsureAssistantUserAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var usersCollection = database.GetCollection<User>(
            _configuration["MongoDB:Collections:Users"] ?? "Users");
        var emailLookupCollection = database.GetCollection<UserEmailLookup>(
            _configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup");

        var existing = await usersCollection
            .Find(u => u.Type == "user" && u.Email == "wa@assistant.local")
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
        {
            if (string.IsNullOrWhiteSpace(existing.Domain))
            {
                existing.Domain = DomainRules.SuperDomain;
                existing.UpdatedAt = DateTime.UtcNow;
                await usersCollection.ReplaceOneAsync(
                    Builders<User>.Filter.Eq(u => u.Id, existing.Id),
                    existing,
                    cancellationToken: cancellationToken);
            }
            await EnsureEmailLookupAsync(emailLookupCollection, existing, cancellationToken);
            return;
        }

        var assistant = new User
        {
            Id = "user_ai_wa",
            Email = "wa@assistant.local",
            Domain = DomainRules.SuperDomain,
            EmailVerified = true,
            IsAdmin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
            Handle = "assistant_1003",
            DisplayName = "Assistant",
            AvatarUrl = "/zodiac/zodiac_01_r1c1.png",
            Gender = "male",
            Bio = "AI assistant",
            IsOnline = true,
            LastSeen = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        };

        assistant.Email = assistant.Email.ToLower();
        assistant.CreatedAt = DateTime.UtcNow;
        assistant.UpdatedAt = DateTime.UtcNow;

        await usersCollection.InsertOneAsync(assistant, cancellationToken: cancellationToken);
        await EnsureEmailLookupAsync(emailLookupCollection, assistant, cancellationToken);

        _logger.LogInformation("Ensured assistant user exists.");
    }

    private static async Task EnsureEmailLookupAsync(
        IMongoCollection<UserEmailLookup> emailLookupCollection,
        User user,
        CancellationToken cancellationToken)
    {
        var lookup = new UserEmailLookup
        {
            Id = user.Email.ToLower(),
            Email = user.Email.ToLower(),
            UserId = user.Id,
            CreatedAt = DateTime.UtcNow
        };

        await emailLookupCollection.ReplaceOneAsync(
            Builders<UserEmailLookup>.Filter.Eq(l => l.Email, lookup.Email),
            lookup,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }
}
