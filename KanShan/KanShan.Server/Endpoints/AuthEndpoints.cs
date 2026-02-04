using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using KanShan.Server.Auth;
using KanShan.Server.Data;
using KanShan.Server.Domain.Entities;
using KanShan.Server.Dtos;

namespace KanShan.Server.Endpoints;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);
        group.MapPost("/dev-login", DevLoginAsync);

        return group;
    }

    private static bool IsValidUserName(string userName)
    {
        if (string.IsNullOrWhiteSpace(userName)) return false;
        if (userName.Length is < 3 or > 32) return false;

        foreach (var ch in userName)
        {
            var ok = char.IsLetterOrDigit(ch) || ch is '_' or '.';
            if (!ok) return false;
        }

        return true;
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        AppDbContext db,
        PasswordHasher<AppUser> passwordHasher,
        ITokenService tokenService,
        CancellationToken cancellationToken)
    {
        var userName = (request.UserName ?? string.Empty).Trim().ToLowerInvariant();
        var displayName = (request.DisplayName ?? string.Empty).Trim();
        var password = request.Password ?? string.Empty;

        if (!IsValidUserName(userName))
        {
            return Results.BadRequest(new { error = "Invalid username (3-32 chars, letters/digits/_/.)" });
        }

        if (password.Length < 6)
        {
            return Results.BadRequest(new { error = "Password must be at least 6 characters" });
        }

        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = userName;
        }

        var exists = await db.Users.AnyAsync(u => u.UserName == userName, cancellationToken);
        if (exists)
        {
            return Results.Conflict(new { error = "Username already exists" });
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            UserName = userName,
            DisplayName = displayName,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        user.PasswordHash = passwordHasher.HashPassword(user, password);

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);

        var token = tokenService.CreateAccessToken(user);
        return Results.Ok(new AuthResponse(token, new UserDto(user.Id, user.UserName, user.DisplayName)));
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        AppDbContext db,
        PasswordHasher<AppUser> passwordHasher,
        ITokenService tokenService,
        CancellationToken cancellationToken)
    {
        var userName = (request.UserName ?? string.Empty).Trim().ToLowerInvariant();
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(password))
        {
            return Results.BadRequest(new { error = "Username/password required" });
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.UserName == userName, cancellationToken);
        if (user is null)
        {
            return Results.Unauthorized();
        }

        var result = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed)
        {
            return Results.Unauthorized();
        }

        var token = tokenService.CreateAccessToken(user);
        return Results.Ok(new AuthResponse(token, new UserDto(user.Id, user.UserName, user.DisplayName)));
    }

    private static async Task<IResult> DevLoginAsync(
        DevLoginRequest request,
        AppDbContext db,
        ITokenService tokenService,
        IHostEnvironment env,
        CancellationToken cancellationToken)
    {
        if (!env.IsDevelopment())
        {
            return Results.NotFound();
        }

        var userName = (request.UserName ?? string.Empty).Trim().ToLowerInvariant();
        if (!DevDataSeeder.DefaultUsers.ContainsKey(userName))
        {
            return Results.BadRequest(new { error = "Allowed dev users: alice, bob, carol" });
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.UserName == userName, cancellationToken);
        if (user is null)
        {
            user = DevDataSeeder.CreateOrUpdateDevUser(userName);
            db.Users.Add(user);
            await db.SaveChangesAsync(cancellationToken);
        }

        var token = tokenService.CreateAccessToken(user);
        return Results.Ok(new AuthResponse(token, new UserDto(user.Id, user.UserName, user.DisplayName)));
    }
}
