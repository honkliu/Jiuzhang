using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using KanKan.API.Hubs;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Implementations;
using KanKan.API.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

var configuredUrls = builder.Configuration["Urls"];
if (!string.IsNullOrWhiteSpace(configuredUrls))
{
    builder.WebHost.UseUrls(configuredUrls);
}

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Configure Swagger
builder.Services.AddSwaggerGen();

// Determine storage mode from configuration
// Supported values: "InMemory", "MongoDB"
var storageMode = builder.Configuration["StorageMode"]?.ToLower() ?? "inmemory";
var useInMemory = storageMode == "inmemory";

if (useInMemory)
{
    Console.WriteLine("🔧 Using IN-MEMORY storage (local development mode)");
    Console.WriteLine("   ⚠️  Data will NOT persist after restart");
}
else if (storageMode == "mongodb")
{
    Console.WriteLine("🔧 Using MONGODB storage (persistent mode)");
    // Configure MongoDB for persistent storage
    builder.Services.AddSingleton<IMongoClient>(sp =>
    {
        var configuration = sp.GetRequiredService<IConfiguration>();
        var connectionString = configuration["MongoDB:ConnectionString"] ?? throw new InvalidOperationException("MongoDB ConnectionString not configured");
        return new MongoClient(connectionString);
    });

    builder.Services.AddHostedService<KanKan.API.Storage.MongoDbInitializer>();
}
else
{
    throw new InvalidOperationException($"Unsupported StorageMode: {storageMode}. Valid options are: InMemory, MongoDB");
}

// Configure JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "development-secret-key-must-be-at-least-32-characters-long";
var key = Encoding.ASCII.GetBytes(jwtSecret);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // Set to true in production
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "KanKan.API",
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "KanKan.Client",
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // Allow SignalR to use JWT from query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;

            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hub"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[] { "http://localhost:3000", "http://localhost:5173" };

        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Add SignalR
builder.Services.AddSignalR();

// Register Repositories and Services based on storage mode
if (useInMemory)
{
    builder.Services.AddSingleton<IUserRepository, InMemoryUserRepository>();
    builder.Services.AddSingleton<IChatRepository, InMemoryChatRepository>();
    builder.Services.AddSingleton<IChatUserRepository, InMemoryChatUserRepository>();
    builder.Services.AddSingleton<IMessageRepository, InMemoryMessageRepository>();
    builder.Services.AddSingleton<IMomentRepository, InMemoryMomentRepository>();
    builder.Services.AddSingleton<IContactRepository, InMemoryContactRepository>();
    builder.Services.AddSingleton<INotificationRepository, InMemoryNotificationRepository>();
    builder.Services.AddScoped<IAuthService, InMemoryAuthService>();
}
else if (storageMode == "mongodb")
{
    builder.Services.AddScoped<IUserRepository, UserRepository>();
    builder.Services.AddScoped<IChatRepository, ChatRepository>();
    builder.Services.AddScoped<IChatUserRepository, ChatUserRepository>();
    builder.Services.AddScoped<IMessageRepository, MessageRepository>();
    builder.Services.AddScoped<IMomentRepository, MomentRepository>();
    builder.Services.AddScoped<IContactRepository, ContactRepository>();
    builder.Services.AddScoped<INotificationRepository, NotificationRepository>();
    builder.Services.AddScoped<IAuthService, AuthService>();
}

builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<IAgentService, OpenAiAgentService>();

// Add logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var app = builder.Build();

if (useInMemory)
{
    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<IUserRepository>();
    var chats = scope.ServiceProvider.GetRequiredService<IChatRepository>();
    var chatUsers = scope.ServiceProvider.GetRequiredService<IChatUserRepository>();
    var messages = scope.ServiceProvider.GetRequiredService<IMessageRepository>();

    var alice = await users.GetByEmailAsync("alice@example.com");
    if (alice == null)
    {
        await users.CreateAsync(new KanKan.API.Models.Entities.User
        {
            Id = "user_alice",
            Type = "user",
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
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });
    }

    var bob = await users.GetByEmailAsync("bob@example.com");
    if (bob == null)
    {
        await users.CreateAsync(new KanKan.API.Models.Entities.User
        {
            Id = "user_bob",
            Type = "user",
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
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });
    }

    var carol = await users.GetByEmailAsync("carol@example.com");
    if (carol == null)
    {
        await users.CreateAsync(new KanKan.API.Models.Entities.User
        {
            Id = "user_carol",
            Type = "user",
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
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });
    }

    var ai = await users.GetByEmailAsync("wa@assistant.local");
    if (ai == null)
    {
        await users.CreateAsync(new KanKan.API.Models.Entities.User
        {
            Id = "user_ai_wa",
            Type = "user",
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
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        });
    }

    // Seed a few starter chats/messages so the UI has something to show.
    // This is intentionally idempotent and only applies to in-memory dev mode.
    var aliceUser = await users.GetByEmailAsync("alice@example.com");
    var bobUser = await users.GetByEmailAsync("bob@example.com");
    var carolUser = await users.GetByEmailAsync("carol@example.com");

    static KanKan.API.Models.Entities.ChatParticipant ToParticipant(KanKan.API.Models.Entities.User u) => new()
    {
        UserId = u.Id,
        DisplayName = u.DisplayName,
        AvatarUrl = u.AvatarUrl ?? "",
        Gender = u.Gender,
        JoinedAt = DateTime.UtcNow,
    };

    async Task SeedTextAsync(KanKan.API.Models.Entities.Chat chat, KanKan.API.Models.Entities.User sender, string text)
    {
        var existing = await messages.GetChatMessagesAsync(chat.Id, limit: 1);
        if (existing.Count > 0) return;

        var msg = new KanKan.API.Models.Entities.Message
        {
            Id = $"msg_seed_{Guid.NewGuid():N}",
            ChatId = chat.Id,
            SenderId = sender.Id,
            SenderName = sender.DisplayName,
            SenderAvatar = sender.AvatarUrl ?? "",
            MessageType = "text",
            Content = new KanKan.API.Models.Entities.MessageContent { Text = text },
            Timestamp = DateTime.UtcNow,
            DeliveredTo = new List<string>(),
            ReadBy = new List<string>(),
            Reactions = new Dictionary<string, string>(),
            IsDeleted = false,
        };

        await messages.CreateAsync(msg);

        chat.LastMessage = new KanKan.API.Models.Entities.ChatLastMessage
        {
            Text = text,
            SenderId = sender.Id,
            SenderName = sender.DisplayName,
            MessageType = "text",
            Timestamp = DateTime.UtcNow,
        };
        chat.UpdatedAt = DateTime.UtcNow;
        await chats.UpdateAsync(chat);

        var chatUserDocs = chat.Participants.Select(p => new KanKan.API.Models.Entities.ChatUser
        {
            Id = chat.Id,
            ChatId = chat.Id,
            UserId = p.UserId,
            ChatType = chat.ChatType,
            Participants = chat.Participants,
            GroupName = chat.GroupName,
            GroupAvatar = chat.GroupAvatar,
            AdminIds = chat.AdminIds,
            LastMessage = chat.LastMessage,
            IsHidden = p.IsHidden,
            ClearedAt = p.ClearedAt,
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        }).ToList();
        await chatUsers.UpsertManyAsync(chatUserDocs);
    }

    if (aliceUser != null && bobUser != null)
    {
        var existingDirect = await chats.GetDirectChatAsync(aliceUser.Id, bobUser.Id);
        if (existingDirect == null)
        {
            existingDirect = await chats.CreateAsync(new KanKan.API.Models.Entities.Chat
            {
                Id = "chat_seed_alice_bob",
                ChatType = "direct",
                Participants = new List<KanKan.API.Models.Entities.ChatParticipant>
                {
                    ToParticipant(aliceUser),
                    ToParticipant(bobUser),
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        var directChatUsers = existingDirect.Participants.Select(p => new KanKan.API.Models.Entities.ChatUser
        {
            Id = existingDirect.Id,
            ChatId = existingDirect.Id,
            UserId = p.UserId,
            ChatType = existingDirect.ChatType,
            Participants = existingDirect.Participants,
            GroupName = existingDirect.GroupName,
            GroupAvatar = existingDirect.GroupAvatar,
            AdminIds = existingDirect.AdminIds,
            LastMessage = existingDirect.LastMessage,
            IsHidden = p.IsHidden,
            ClearedAt = p.ClearedAt,
            CreatedAt = existingDirect.CreatedAt,
            UpdatedAt = existingDirect.UpdatedAt
        }).ToList();
        await chatUsers.UpsertManyAsync(directChatUsers);

        await SeedTextAsync(existingDirect, aliceUser, "Hi Bob 👋");
    }

    if (aliceUser != null && bobUser != null && carolUser != null)
    {
        var group = await chats.GetByIdAsync("chat_seed_group_abc");
        if (group == null)
        {
            group = await chats.CreateAsync(new KanKan.API.Models.Entities.Chat
            {
                Id = "chat_seed_group_abc",
                ChatType = "group",
                GroupName = "Alice · Bob · Carol",
                Participants = new List<KanKan.API.Models.Entities.ChatParticipant>
                {
                    ToParticipant(aliceUser),
                    ToParticipant(bobUser),
                    ToParticipant(carolUser),
                },
                AdminIds = new List<string> { aliceUser.Id },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        var groupChatUsers = group.Participants.Select(p => new KanKan.API.Models.Entities.ChatUser
        {
            Id = group.Id,
            ChatId = group.Id,
            UserId = p.UserId,
            ChatType = group.ChatType,
            Participants = group.Participants,
            GroupName = group.GroupName,
            GroupAvatar = group.GroupAvatar,
            AdminIds = group.AdminIds,
            LastMessage = group.LastMessage,
            IsHidden = p.IsHidden,
            ClearedAt = p.ClearedAt,
            CreatedAt = group.CreatedAt,
            UpdatedAt = group.UpdatedAt
        }).ToList();
        await chatUsers.UpsertManyAsync(groupChatUsers);

        await SeedTextAsync(group, carolUser, "Welcome to the group chat!" );
    }
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "KanKan API v1");
        // Serve Swagger UI at /swagger
        c.RoutePrefix = "swagger";
    });
}

// Disable HTTPS redirection in development
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles();

app.UseCors("AllowClient");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Map SignalR hubs
app.MapHub<ChatHub>("/hub/chat");

Console.WriteLine("🚀 KanKan API started!");
Console.WriteLine($"📡 SignalR Hub available at: /hub/chat");

app.Run();
