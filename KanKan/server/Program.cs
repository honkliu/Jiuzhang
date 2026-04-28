using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Core.Events;
using Microsoft.IdentityModel.Tokens;
using KanKan.API.Domain;
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

var isolationRules = builder.Configuration.GetSection("DomainIsolation")
    .Get<Dictionary<string, string[]>>();
DomainRules.ConfigureIsolation(isolationRules);

var visibilityRules = builder.Configuration.GetSection("DomainVisibility")
    .Get<Dictionary<string, string[]>>();
DomainRules.ConfigureVisibility(visibilityRules);

// Configure Swagger
builder.Services.AddSwaggerGen();

// Determine storage mode from configuration
// Supported values: "InMemory", "MongoDB"
var storageMode = builder.Configuration["StorageMode"]?.ToLower() ?? "inmemory";
var useInMemory = storageMode == "inmemory";
var mongoCommandCollections = new ConcurrentDictionary<long, string>();

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
        var loggerFactory = sp.GetRequiredService<ILoggerFactory>();
        var logger = loggerFactory.CreateLogger("MongoDB.Driver");
        var connectionString = configuration["MongoDB:ConnectionString"]
            ?? throw new InvalidOperationException("MongoDB ConnectionString not configured");

        var mongoUrl = new MongoUrl(connectionString);
        var settings = MongoClientSettings.FromUrl(mongoUrl);
        // The C# driver defaults to a 64KB socket receive buffer. For queries that return
        // large binary documents (e.g. full-size avatar images, ~1MB each), this causes
        // hundreds of small socket reads over WAN, each requiring a round-trip ACK.
        // 4MB matches OS-level defaults used by pymongo and reduces 14MB fetch from ~31s to ~2s.
        settings.ClusterConfigurator = cb =>
        {
            cb.ConfigureTcp(tcp => tcp.With(receiveBufferSize: 4 * 1024 * 1024, sendBufferSize: 4 * 1024 * 1024));
            cb.Subscribe<CommandStartedEvent>(e =>
            {
                // Track in-flight opIds so we can correlate success/failure logs
                var collection = TryGetCollectionName(e.CommandName, e.Command);
                if (collection != null && collection.Equals("avatarImages", StringComparison.OrdinalIgnoreCase))
                {
                    var opId = e.OperationId ?? -1;
                    if (opId >= 0) mongoCommandCollections[opId] = collection;
                }
            });

            cb.Subscribe<CommandSucceededEvent>(e =>
            {
                var opId = e.OperationId ?? -1;
                if (opId >= 0 && mongoCommandCollections.TryRemove(opId, out var collection))
                {
                    // getMore means BatchSize hint was ignored — the result set didn't fit in one
                    // response packet. This is worth surfacing because it adds a WAN round-trip.
                    if (e.CommandName.Equals("getMore", StringComparison.OrdinalIgnoreCase))
                    {
                        logger.LogWarning(
                            "Mongo getMore (BatchSize miss) opId={OperationId} durationMs={DurationMs} collection={Collection}",
                            e.OperationId, e.Duration.TotalMilliseconds, collection);
                    }
                    else
                    {
                        logger.LogDebug(
                            "Mongo {Command} opId={OperationId} durationMs={DurationMs} collection={Collection}",
                            e.CommandName, e.OperationId, e.Duration.TotalMilliseconds, collection);
                    }
                }
            });

            cb.Subscribe<CommandFailedEvent>(e =>
            {
                var opId = e.OperationId ?? -1;
                if (opId >= 0 && mongoCommandCollections.TryRemove(opId, out var collection))
                {
                    logger.LogWarning(
                        e.Failure,
                        "Mongo {Command} FAILED opId={OperationId} durationMs={DurationMs} collection={Collection}",
                        e.CommandName, e.OperationId, e.Duration.TotalMilliseconds, collection);
                }
            });
        };

        return new MongoClient(settings);
    });

    builder.Services.AddHostedService<KanKan.API.Storage.MongoDbInitializer>();
}
else
{
    throw new InvalidOperationException($"Unsupported StorageMode: {storageMode}. Valid options are: InMemory, MongoDB");
}

static string? TryGetCollectionName(string commandName, BsonDocument command)
{
    if (commandName.Equals("find", StringComparison.OrdinalIgnoreCase) && command.TryGetValue("find", out var findValue))
    {
        return findValue.AsString;
    }

    if (commandName.Equals("aggregate", StringComparison.OrdinalIgnoreCase) && command.TryGetValue("aggregate", out var aggregateValue))
    {
        return aggregateValue.AsString;
    }

    if (commandName.Equals("getMore", StringComparison.OrdinalIgnoreCase) && command.TryGetValue("collection", out var collectionValue))
    {
        return collectionValue.AsString;
    }

    if (command.TryGetValue("collection", out var fallbackCollection))
    {
        return fallbackCollection.AsString;
    }

    return null;
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
            ?? Array.Empty<string>();

        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }
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
    // Family repos (InMemory stubs — returns empty data, writes are no-ops)
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilyTreeRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilyPersonRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilyRelationshipRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilyTreeVisibilityRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilySectionRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IFamilyPageRepository, KanKan.API.Repositories.Implementations.InMemoryFamilyRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.INotebookRepository, KanKan.API.Repositories.Implementations.InMemoryNotebookRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.INotebookVisibilityRepository, KanKan.API.Repositories.Implementations.InMemoryNotebookRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.INotebookSectionRepository, KanKan.API.Repositories.Implementations.InMemoryNotebookRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.INotebookPageRepository, KanKan.API.Repositories.Implementations.InMemoryNotebookRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IReceiptRepository, KanKan.API.Repositories.Implementations.InMemoryReceiptRepository>();
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IReceiptVisitRepository, KanKan.API.Repositories.Implementations.InMemoryReceiptRepository>();
    // Phase 5: MedicalRecordIndex repository
    builder.Services.AddSingleton<KanKan.API.Repositories.Interfaces.IMedicalRecordIndexRepository, KanKan.API.Repositories.Implementations.InMemoryMedicalRecordIndexRepository>();
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
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilyTreeRepository, KanKan.API.Repositories.Implementations.FamilyTreeRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilyPersonRepository, KanKan.API.Repositories.Implementations.FamilyPersonRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilyRelationshipRepository, KanKan.API.Repositories.Implementations.FamilyRelationshipRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilyTreeVisibilityRepository, KanKan.API.Repositories.Implementations.FamilyTreeVisibilityRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilySectionRepository, KanKan.API.Repositories.Implementations.FamilySectionRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IFamilyPageRepository, KanKan.API.Repositories.Implementations.FamilyPageRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.INotebookRepository, KanKan.API.Repositories.Implementations.NotebookRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.INotebookVisibilityRepository, KanKan.API.Repositories.Implementations.NotebookVisibilityRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.INotebookSectionRepository, KanKan.API.Repositories.Implementations.NotebookSectionRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.INotebookPageRepository, KanKan.API.Repositories.Implementations.NotebookPageRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IReceiptRepository, KanKan.API.Repositories.Implementations.ReceiptRepository>();
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IReceiptVisitRepository, KanKan.API.Repositories.Implementations.ReceiptVisitRepository>();
    // Phase 5: MedicalRecordIndex repository
    builder.Services.AddScoped<KanKan.API.Repositories.Interfaces.IMedicalRecordIndexRepository, KanKan.API.Repositories.Implementations.MedicalRecordIndexRepository>();
    // Photo album services (MongoDB only)
    builder.Services.AddScoped<IPhotoRepository, PhotoRepository>();
    builder.Services.AddScoped<PhotoService>();
    builder.Services.AddScoped<IAutoAssociateService, AutoAssociateService>();
    builder.Services.AddScoped<IVisitStatsService, VisitStatsService>();
}

builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<IAgentService, OpenAiAgentService>();

// Register Image Generation services (MongoDB only)
if (storageMode == "mongodb")
{
    builder.Services.AddSingleton(sp =>
    {
        var mongoClient = sp.GetRequiredService<IMongoClient>();
        var databaseName = builder.Configuration["MongoDB:DatabaseName"] ?? "kankan";
        return mongoClient.GetDatabase(databaseName);
    });

    builder.Services.AddHttpClient<KanKan.API.Services.IComfyUIService, KanKan.API.Services.Implementations.ComfyUIService>();
    builder.Services.AddScoped<KanKan.API.Services.IAvatarService, KanKan.API.Services.Implementations.AvatarService>();
    builder.Services.AddScoped<KanKan.API.Services.IImageGenerationService, KanKan.API.Services.Implementations.ImageGenerationService>();
}

// Add logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var app = builder.Build();

if (useInMemory)
{
    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<IUserRepository>();

    var ai = await users.GetByEmailAsync("wa@assistant.local");
    if (ai == null)
    {
        await users.CreateAsync(new KanKan.API.Models.Entities.User
        {
            Id = "user_ai_wa",
            Type = "user",
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

app.UseWhen(
    context => context.Request.Path.StartsWithSegments("/uploads")
        && !context.Request.Path.StartsWithSegments("/uploads/receipts"),
    uploadBranch =>
    {
        uploadBranch.UseAuthentication();
        uploadBranch.Use(async (context, next) =>
        {
            var authResult = await context.AuthenticateAsync();
            if (authResult.Succeeded && authResult.Principal != null)
            {
                context.User = authResult.Principal;
                await next();
                return;
            }

            var refreshToken = context.Request.Cookies["refreshToken"];
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            var authService = context.RequestServices.GetRequiredService<IAuthService>();
            var user = await authService.GetUserByValidRefreshTokenAsync(refreshToken);
            if (user == null)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            context.User = new ClaimsPrincipal(
                new ClaimsIdentity(
                    new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, user.Id),
                        new Claim(ClaimTypes.Name, user.DisplayName)
                    },
                    authenticationType: "RefreshTokenUploadAccess"));

            await next();
        });
    });

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
