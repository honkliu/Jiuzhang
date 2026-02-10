using MongoDB.Driver;
using KanKan.API.Models.Entities;

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

        // Ensure the assistant user always exists for MongoDB mode.
        await EnsureAssistantUserAsync(database, cancellationToken);

        var seedTestData = _configuration.GetValue<bool>("MongoDB:Initialization:SeedTestData", false);
        if (seedTestData)
        {
            await SeedTestDataAsync(database, cancellationToken);
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

        _logger.LogInformation("Created indexes for all collections.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

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

        var alice = await EnsureUserAsync(new User
        {
            Id = "user_alice",
            Email = "alice@example.com",
            EmailVerified = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("12345678"),
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
            EmailVerified = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("12345678"),
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
            EmailVerified = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("12345678"),
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
            EmailVerified = true,
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
            await EnsureEmailLookupAsync(emailLookupCollection, existing, cancellationToken);
            return;
        }

        var assistant = new User
        {
            Id = "user_ai_wa",
            Email = "wa@assistant.local",
            EmailVerified = true,
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
