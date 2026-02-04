using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using KanShan.Server.Auth;
using KanShan.Server.Data;
using KanShan.Server.Domain.Entities;
using KanShan.Server.Endpoints;
using KanShan.Server.Hubs;
using KanShan.Server.Presence;
using KanShan.Server.Storage;
using KanShan.Server.Wa;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<FileStorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<WaOptions>(builder.Configuration.GetSection("Wa"));

builder.Services.AddDbContext<AppDbContext>(options =>
{
	var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=App_Data/chat.db";
	options.UseSqlite(connectionString);
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddSingleton<PasswordHasher<AppUser>>();
builder.Services.AddSingleton<IFileStorage, LocalFileStorage>();
builder.Services.AddSingleton<IPresenceTracker, PresenceTracker>();

builder.Services.AddHttpClient<IWaClient, WaClient>();
builder.Services.AddSingleton<IWaOrchestrator, WaOrchestrator>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
	.AddJwtBearer(options =>
	{
		var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
		if (string.IsNullOrWhiteSpace(jwt.SigningKey) || jwt.SigningKey.StartsWith("DEV_ONLY_", StringComparison.OrdinalIgnoreCase))
		{
			// Dev-friendly default, but still requires something non-empty.
			// You can change it in appsettings.json before shipping.
			jwt.SigningKey = "DEV_ONLY_change_me_to_a_long_random_secret";
		}

		options.TokenValidationParameters = new TokenValidationParameters
		{
			ValidateIssuer = true,
			ValidateAudience = true,
			ValidateIssuerSigningKey = true,
			ValidIssuer = jwt.Issuer,
			ValidAudience = jwt.Audience,
			IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
			ClockSkew = TimeSpan.FromMinutes(1),
		};

		options.Events = new JwtBearerEvents
		{
			OnMessageReceived = context =>
			{
				// SignalR uses query string for WebSocket/SSE token transport.
				var accessToken = context.Request.Query["access_token"].ToString();
				var path = context.HttpContext.Request.Path;
				if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/chat"))
				{
					context.Token = accessToken;
				}
				return Task.CompletedTask;
			}
		};
	});

builder.Services.AddAuthorization();
builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
	options.AddPolicy("web", policy =>
	{
		var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
			?? new[] { "http://localhost:5173" };

		policy.WithOrigins(allowedOrigins)
			.AllowAnyHeader()
			.AllowAnyMethod()
			.AllowCredentials();
	});
});

var app = builder.Build();

// Create DB + local folders (dev-friendly).
using (var scope = app.Services.CreateScope())
{
	Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "App_Data"));

	var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
	db.Database.EnsureCreated();
	SqliteSchemaUpgrader.UpgradeIfNeeded(db, scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("SqliteSchemaUpgrader"));

	// Ensure wa(娲) exists as a normal user so it can be added to chats.
	var waExists = db.Users.Any(u => u.Id == WaIdentity.UserId || u.UserName == WaIdentity.UserName);
	if (!waExists)
	{
		db.Users.Add(new AppUser
		{
			Id = WaIdentity.UserId,
			UserName = WaIdentity.UserName,
			DisplayName = WaIdentity.DisplayName,
			PasswordHash = "SYSTEM_NO_PASSWORD",
		});
		db.SaveChanges();
	}

	if (app.Environment.IsDevelopment())
	{
		var seeded = false;
		foreach (var userName in DevDataSeeder.DefaultUsers.Keys)
		{
			var normalized = userName.Trim().ToLowerInvariant();
			var exists = db.Users.Any(u => u.UserName == normalized);
			if (!exists)
			{
				db.Users.Add(DevDataSeeder.CreateOrUpdateDevUser(normalized));
				seeded = true;
			}
		}

		if (seeded)
		{
			db.SaveChanges();
		}
	}

	var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();
	_ = storage.GetUploadsPhysicalPath();
}

app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

var storageOptions = app.Services.GetRequiredService<IOptions<FileStorageOptions>>().Value;
var uploadsPhysical = Path.Combine(app.Environment.ContentRootPath, storageOptions.UploadsPath);
Directory.CreateDirectory(uploadsPhysical);

app.UseStaticFiles(new StaticFileOptions
{
	FileProvider = new PhysicalFileProvider(uploadsPhysical),
	RequestPath = storageOptions.PublicBasePath,
});

app.MapGet("/", () => Results.Ok(new { name = "KanShan.Server", status = "ok" }));
app.MapApi();
app.MapHub<ChatHub>("/hubs/chat").RequireAuthorization();

app.Run();
