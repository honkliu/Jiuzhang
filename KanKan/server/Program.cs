using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Azure.Cosmos;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
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
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "KanKan API",
        Version = "v1",
        Description = "Real-time messaging application API"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Determine if we should use in-memory storage (for development without Cosmos DB)
var useInMemory = builder.Configuration.GetValue<bool>("UseInMemoryStorage", true);

if (!useInMemory)
{
    // Configure Cosmos DB for production
    builder.Services.AddSingleton(sp =>
    {
        var configuration = sp.GetRequiredService<IConfiguration>();
        var endpoint = configuration["CosmosDb:Endpoint"] ?? throw new InvalidOperationException("Cosmos DB Endpoint not configured");
        var key = configuration["CosmosDb:Key"] ?? throw new InvalidOperationException("Cosmos DB Key not configured");

        return new CosmosClient(endpoint, key, new CosmosClientOptions
        {
            SerializerOptions = new CosmosSerializationOptions
            {
                PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
            }
        });
    });
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
    Console.WriteLine("🔧 Using IN-MEMORY storage (development mode)");
    builder.Services.AddSingleton<IUserRepository, InMemoryUserRepository>();
    builder.Services.AddSingleton<IChatRepository, InMemoryChatRepository>();
    builder.Services.AddSingleton<IMessageRepository, InMemoryMessageRepository>();
    builder.Services.AddSingleton<IMomentRepository, InMemoryMomentRepository>();
    builder.Services.AddSingleton<IContactRepository, InMemoryContactRepository>();
    builder.Services.AddSingleton<INotificationRepository, InMemoryNotificationRepository>();
    builder.Services.AddScoped<IAuthService, InMemoryAuthService>();
}
else
{
    Console.WriteLine("🔧 Using COSMOS DB storage (production mode)");
    builder.Services.AddScoped<IUserRepository, UserRepository>();
    builder.Services.AddScoped<IChatRepository, ChatRepository>();
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
            AvatarUrl = "https://i.pravatar.cc/150?img=1",
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
            AvatarUrl = "https://i.pravatar.cc/150?img=2",
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
            AvatarUrl = "https://i.pravatar.cc/150?img=4",
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
            AvatarUrl = "https://i.pravatar.cc/150?img=3",
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
