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
            "imageGenerationJobs"
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

        var seedTestData = _configuration.GetValue<bool>("MongoDB:Initialization:SeedTestData", false);
        if (seedTestData)
        {
            await SeedTestDataAsync(database, cancellationToken);
            await SeedFamilyDataAsync(database, cancellationToken);
        }

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

    private async Task SeedTestDataAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var usersCollection = database.GetCollection<User>(
            _configuration["MongoDB:Collections:Users"] ?? "Users");
        var emailLookupCollection = database.GetCollection<UserEmailLookup>(
            _configuration["MongoDB:Collections:UserEmailLookup"] ?? "UserEmailLookup");
        var chatsCollection = database.GetCollection<Chat>(
            _configuration["MongoDB:Collections:Chats"] ?? "Chats");
        var chatUsersCollection = database.GetCollection<ChatUser>(
            _configuration["MongoDB:Collections:ChatUsers"] ?? "ChatUsers");
        var messagesCollection = database.GetCollection<Message>(
            _configuration["MongoDB:Collections:Messages"] ?? "Messages");

        async Task<User> EnsureUserAsync(User user)
        {
            var normalizedEmail = user.Email.ToLower();
            var existing = await usersCollection.Find(Builders<User>.Filter.And(
                    Builders<User>.Filter.Eq(u => u.Type, "user"),
                    Builders<User>.Filter.Eq(u => u.Email, normalizedEmail)))
                .FirstOrDefaultAsync(cancellationToken);

            if (existing != null)
            {
                if (string.IsNullOrWhiteSpace(existing.Domain))
                {
                    existing.Domain = DomainRules.GetDomain(existing.Email);
                    existing.UpdatedAt = DateTime.UtcNow;
                    await usersCollection.ReplaceOneAsync(
                        Builders<User>.Filter.Eq(u => u.Id, existing.Id),
                        existing,
                        cancellationToken: cancellationToken);
                }
                await EnsureEmailLookupAsync(emailLookupCollection, existing, cancellationToken);
                return existing;
            }

            user.Email = normalizedEmail;
            user.CreatedAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;

            await usersCollection.InsertOneAsync(user, cancellationToken: cancellationToken);
            await EnsureEmailLookupAsync(emailLookupCollection, user, cancellationToken);
            return user;
        }

        static ChatParticipant ToParticipant(User user) => new()
        {
            UserId = user.Id,
            DisplayName = user.DisplayName,
            AvatarUrl = user.AvatarUrl ?? string.Empty,
            Gender = user.Gender,
            JoinedAt = DateTime.UtcNow
        };

        async Task UpsertChatUsersAsync(Chat chat)
        {
            foreach (var participant in chat.Participants)
            {
                var chatUser = new ChatUser
                {
                    Id = $"{chat.Id}:{participant.UserId}",
                    ChatId = chat.Id,
                    UserId = participant.UserId,
                    Domain = chat.Domain,
                    ChatType = chat.ChatType,
                    Participants = chat.Participants,
                    GroupName = chat.GroupName,
                    GroupAvatar = chat.GroupAvatar,
                    AdminIds = chat.AdminIds,
                    LastMessage = chat.LastMessage,
                    IsHidden = participant.IsHidden,
                    ClearedAt = participant.ClearedAt,
                    CreatedAt = chat.CreatedAt,
                    UpdatedAt = chat.UpdatedAt
                };

                var filter = Builders<ChatUser>.Filter.And(
                    Builders<ChatUser>.Filter.Eq(cu => cu.UserId, chatUser.UserId),
                    Builders<ChatUser>.Filter.Eq(cu => cu.ChatId, chatUser.ChatId));

                await chatUsersCollection.ReplaceOneAsync(
                    filter,
                    chatUser,
                    new ReplaceOptions { IsUpsert = true },
                    cancellationToken);
            }
        }

        async Task SeedTextAsync(Chat chat, User sender, string text)
        {
            var hasMessages = await messagesCollection
                .Find(m => m.ChatId == chat.Id)
                .Limit(1)
                .AnyAsync(cancellationToken);

            if (hasMessages)
                return;

            var message = new Message
            {
                Id = $"msg_seed_{Guid.NewGuid():N}",
                ChatId = chat.Id,
                SenderId = sender.Id,
                SenderName = sender.DisplayName,
                SenderAvatar = sender.AvatarUrl ?? string.Empty,
                MessageType = "text",
                Content = new MessageContent { Text = text },
                Timestamp = DateTime.UtcNow,
                DeliveredTo = new List<string>(),
                ReadBy = new List<string>(),
                Reactions = new Dictionary<string, string>(),
                IsDeleted = false
            };

            await messagesCollection.InsertOneAsync(message, cancellationToken: cancellationToken);

            chat.LastMessage = new ChatLastMessage
            {
                Text = text,
                SenderId = sender.Id,
                SenderName = sender.DisplayName,
                MessageType = "text",
                Timestamp = DateTime.UtcNow
            };
            chat.UpdatedAt = DateTime.UtcNow;

            await chatsCollection.ReplaceOneAsync(
                Builders<Chat>.Filter.Eq(c => c.Id, chat.Id),
                chat,
                new ReplaceOptions { IsUpsert = true },
                cancellationToken);

            await UpsertChatUsersAsync(chat);
        }

        var seedPassword = Environment.GetEnvironmentVariable("KANKAN_SEED_PASSWORD")
            ?? Guid.NewGuid().ToString("N");

        var alice = await EnsureUserAsync(new User
        {
            Id = "user_alice",
            Email = "alice@example.com",
            Domain = DomainRules.GetDomain("alice@example.com"),
            EmailVerified = true,
            IsAdmin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(seedPassword),
            Handle = "alice_1001",
            DisplayName = "Alice",
            AvatarUrl = "/zodiac/f2.png",
            Gender = "female",
            Bio = "Hi, I'm Alice",
            IsOnline = false,
            LastSeen = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });

        var bob = await EnsureUserAsync(new User
        {
            Id = "user_bob",
            Email = "bob@example.com",
            Domain = DomainRules.GetDomain("bob@example.com"),
            EmailVerified = true,
            IsAdmin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(seedPassword),
            Handle = "bob_1002",
            DisplayName = "Bob",
            AvatarUrl = "/zodiac/m1.png",
            Gender = "male",
            Bio = "Hi, I'm Bob",
            IsOnline = false,
            LastSeen = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });

        var carol = await EnsureUserAsync(new User
        {
            Id = "user_carol",
            Email = "carol@example.com",
            Domain = DomainRules.GetDomain("carol@example.com"),
            EmailVerified = true,
            IsAdmin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(seedPassword),
            Handle = "carol_1004",
            DisplayName = "Carol",
            AvatarUrl = "/zodiac/f3.png",
            Gender = "female",
            Bio = "Hi, I'm Carol",
            IsOnline = false,
            LastSeen = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });

        await EnsureUserAsync(new User
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
        });

        var directChat = await chatsCollection
            .Find(c => c.Id == "chat_seed_alice_bob")
            .FirstOrDefaultAsync(cancellationToken);

        if (directChat == null)
        {
            directChat = new Chat
            {
                Id = "chat_seed_alice_bob",
                Domain = alice.Domain,
                ChatType = "direct",
                Participants = new List<ChatParticipant>
                {
                    ToParticipant(alice),
                    ToParticipant(bob)
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await chatsCollection.InsertOneAsync(directChat, cancellationToken: cancellationToken);
        }

        await UpsertChatUsersAsync(directChat);
        await SeedTextAsync(directChat, alice, "Hi Bob");

        var groupChat = await chatsCollection
            .Find(c => c.Id == "chat_seed_group_abc")
            .FirstOrDefaultAsync(cancellationToken);

        if (groupChat == null)
        {
            groupChat = new Chat
            {
                Id = "chat_seed_group_abc",
                Domain = alice.Domain,
                ChatType = "group",
                GroupName = "Alice - Bob - Carol",
                Participants = new List<ChatParticipant>
                {
                    ToParticipant(alice),
                    ToParticipant(bob),
                    ToParticipant(carol)
                },
                AdminIds = new List<string> { alice.Id },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await chatsCollection.InsertOneAsync(groupChat, cancellationToken: cancellationToken);
        }

        await UpsertChatUsersAsync(groupChat);
        await SeedTextAsync(groupChat, carol, "Welcome to the group chat!");

        _logger.LogInformation("Seeded test users and starter chats (Alice, Bob, Carol).");
    }

    private async Task SeedFamilyDataAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var treesCol = database.GetCollection<FamilyTree>(
            _configuration["MongoDB:Collections:FamilyTrees"] ?? "FamilyTrees");
        var personsCol = database.GetCollection<FamilyPerson>(
            _configuration["MongoDB:Collections:FamilyPersons"] ?? "FamilyPersons");
        var relsCol = database.GetCollection<FamilyRelationship>(
            _configuration["MongoDB:Collections:FamilyRelationships"] ?? "FamilyRelationships");

        const string treeId = "ftree_seed_li";
        var existing = await treesCol.Find(t => t.Id == treeId).FirstOrDefaultAsync(cancellationToken);
        if (existing != null)
        {
            _logger.LogInformation("Family seed data already exists, skipping.");
            return;
        }

        var domain = DomainRules.GetDomain("kankan@kankan");
        var now = DateTime.UtcNow;

        var tree = new FamilyTree
        {
            Id = treeId,
            Name = "李氏家谱",
            Surname = "李",
            OwnerId = "user_ai_wa",
            Domain = domain,
            RootGeneration = 1,
            ZibeiPoem = new List<string> { "国", "志", "正", "朝", "文", "明", "德", "仁", "义", "礼" },
            CreatedAt = now,
            UpdatedAt = now
        };
        await treesCol.InsertOneAsync(tree, cancellationToken: cancellationToken);

        // We'll generate 10 generations: each person (male) has 3-5 children.
        // Generation 1: one couple (root)
        var persons = new List<FamilyPerson>();
        var rels = new List<FamilyRelationship>();
        var rng = new Random(42);

        // Chinese surname list for males: Li family
        string[] maleGiven = { "国栋", "国梁", "志远", "志宏", "志伟", "志强", "志刚", "志华", "正豪", "正轩", "正宇", "正航", "正阳", "正明", "正清", "正华", "正文", "正武", "正飞", "正伟", "正勇", "朝阳", "朝晖", "朝辉", "朝东", "朝西", "朝南", "朝北", "朝林", "朝森", "文博", "文昊", "文轩", "文杰", "文浩", "文峰", "文涛", "文宇", "文凯", "文倩", "明哲", "明智", "明德", "明辉", "明亮", "明远", "明达", "明新", "明晖", "明军", "德明", "德强", "德华", "德志", "德才", "德兴", "德旺", "德荣", "德贵", "德仁", "仁义", "仁杰", "仁勇", "仁智", "仁厚", "仁光", "仁海", "仁山", "仁田", "仁心" };
        string[] femaleGiven = { "国芬", "国秀", "志兰", "志梅", "志芳", "志春", "志英", "志霞", "正华", "正美", "正娟", "正艳", "正丽", "正蓉", "正琴", "正燕", "朝霞", "朝红", "朝玉", "朝珍", "文娟", "文静", "文慧", "文雅", "文秀", "明珠", "明玉", "明秀", "明芳", "明慧", "德芬", "德英", "德秀", "德慧", "德美", "仁芳", "仁慧", "仁秀", "仁珍", "仁美" };
        string[] spouseSurnames = { "王", "张", "陈", "赵", "刘", "吴", "周", "孙", "杨", "黄", "林", "徐", "马", "何", "高", "郑", "谢", "宋", "唐", "许" };
        string[] spouseGiven = { "氏", "芳", "英", "华", "梅", "秀", "燕", "玉", "珍", "静", "慧", "丽", "娟", "红", "云", "月", "桂", "香", "莲", "芬" };

        int maleIdx = 0;
        int femaleIdx = 0;
        int spouseIdx = 0;

        string NextMaleName()
        {
            var given = maleGiven[maleIdx % maleGiven.Length];
            maleIdx++;
            return $"李{given}";
        }
        string NextFemaleName()
        {
            var given = femaleGiven[femaleIdx % femaleGiven.Length];
            femaleIdx++;
            return $"李{given}";
        }
        string NextSpouseName()
        {
            var sur = spouseSurnames[spouseIdx % spouseSurnames.Length];
            var giv = spouseGiven[spouseIdx % spouseGiven.Length];
            spouseIdx++;
            return $"{sur}{giv}";
        }

        FamilyPerson MakePerson(string name, string gender, int gen, int baseYear)
        {
            var birthYear = baseYear + rng.Next(-3, 4);
            return new FamilyPerson
            {
                Id = $"fperson_{Guid.NewGuid():N}",
                TreeId = treeId,
                Domain = domain,
                Name = name,
                Gender = gender,
                Generation = gen,
                BirthDate = new FamilyDate { Year = birthYear },
                IsAlive = birthYear > 1960,
                CreatedAt = now,
                UpdatedAt = now
            };
        }

        FamilyRelationship MakeSpouseRel(string fromId, string toId) => new()
        {
            Id = $"frel_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = domain,
            Type = "spouse",
            FromId = fromId,
            ToId = toId,
            UnionType = "married",
            CreatedAt = now
        };

        FamilyRelationship MakeParentChildRel(string parentId, string childId, int sortOrder) => new()
        {
            Id = $"frel_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = domain,
            Type = "parent-child",
            FromId = parentId,
            ToId = childId,
            ParentRole = "father",
            ChildStatus = "biological",
            SortOrder = sortOrder,
            CreatedAt = now
        };

        // Generation birth year anchors (30 years per generation, starting 1824)
        int[] genBirthYears = { 1824, 1854, 1884, 1914, 1944, 1966, 1990, 2012, 2030, 2048 };

        // Build gen 1: root couple
        var rootMale = MakePerson(NextMaleName(), "male", 1, genBirthYears[0]);
        var rootFemale = MakePerson(NextSpouseName(), "female", 1, genBirthYears[0]);
        persons.Add(rootMale);
        persons.Add(rootFemale);
        rels.Add(MakeSpouseRel(rootMale.Id, rootFemale.Id));

        // currentGen holds the male "heads" whose children we need to generate
        var currentGenMales = new List<FamilyPerson> { rootMale };

        for (int gen = 2; gen <= 10; gen++)
        {
            var nextGenMales = new List<FamilyPerson>();
            int baseYear = genBirthYears[gen - 1];

            foreach (var father in currentGenMales)
            {
                int childCount = rng.Next(3, 6); // 3-5 children
                for (int c = 0; c < childCount; c++)
                {
                    // ~75% chance each child is male
                    bool isMale = rng.NextDouble() < 0.75;
                    var childName = isMale ? NextMaleName() : NextFemaleName();
                    var child = MakePerson(childName, isMale ? "male" : "female", gen, baseYear);
                    persons.Add(child);
                    rels.Add(MakeParentChildRel(father.Id, child.Id, c));

                    // Give each child a spouse (except generation 10 which is very young)
                    if (gen <= 9 && isMale)
                    {
                        var spouse = MakePerson(NextSpouseName(), "female", gen, baseYear);
                        persons.Add(spouse);
                        rels.Add(MakeSpouseRel(child.Id, spouse.Id));
                        nextGenMales.Add(child); // only males carry the line
                    }
                }
            }

            currentGenMales = nextGenMales;

            // Stop if the tree gets too large (cap at ~1000 persons)
            if (persons.Count > 800) break;
        }

        // Insert in batches
        const int batchSize = 100;
        for (int i = 0; i < persons.Count; i += batchSize)
        {
            var batch = persons.Skip(i).Take(batchSize).ToList();
            await personsCol.InsertManyAsync(batch, cancellationToken: cancellationToken);
        }

        for (int i = 0; i < rels.Count; i += batchSize)
        {
            var batch = rels.Skip(i).Take(batchSize).ToList();
            await relsCol.InsertManyAsync(batch, cancellationToken: cancellationToken);
        }

        _logger.LogInformation("Seeded family tree with {PersonCount} persons and {RelCount} relationships across 10 generations.", persons.Count, rels.Count);
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
