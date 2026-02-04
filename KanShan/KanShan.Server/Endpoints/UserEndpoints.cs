using Microsoft.EntityFrameworkCore;
using KanShan.Server.Auth;
using KanShan.Server.Data;
using KanShan.Server.Dtos;

namespace KanShan.Server.Endpoints;

public static class UserEndpoints
{
    public static RouteGroupBuilder MapUserEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/users");

        group.MapGet("/me", GetMeAsync).RequireAuthorization();
        group.MapGet("/", ListAsync).RequireAuthorization();
        group.MapGet("/search", SearchAsync).RequireAuthorization();

        return group;
    }

    private static async Task<IResult> GetMeAsync(ICurrentUser currentUser, AppDbContext db, CancellationToken cancellationToken)
    {
        var user = await db.Users
            .Where(u => u.Id == currentUser.UserId)
            .Select(u => new UserDto(u.Id, u.UserName, u.DisplayName))
            .SingleOrDefaultAsync(cancellationToken);

        return user is null ? Results.NotFound() : Results.Ok(user);
    }

    private static async Task<IResult> ListAsync(int? limit, ICurrentUser currentUser, AppDbContext db, CancellationToken cancellationToken)
    {
        var take = limit is null ? 50 : Math.Clamp(limit.Value, 1, 200);

        var users = await db.Users
            .Where(u => u.Id != currentUser.UserId)
            .OrderBy(u => u.UserName)
            .Take(take)
            .Select(u => new UserDto(u.Id, u.UserName, u.DisplayName))
            .ToListAsync(cancellationToken);

        return Results.Ok(users);
    }

    private static async Task<IResult> SearchAsync(string? q, ICurrentUser currentUser, AppDbContext db, CancellationToken cancellationToken)
    {
        q = (q ?? string.Empty).Trim();
        if (q.Length < 1)
        {
            return Results.Ok(Array.Empty<UserDto>());
        }

        var term = q.ToLowerInvariant();
        var displayNameLike = $"%{q}%";

        var users = await db.Users
            .Where(u => u.Id != currentUser.UserId)
            .Where(u => u.UserName.Contains(term) || EF.Functions.Like(u.DisplayName, displayNameLike))
            .OrderBy(u => u.UserName)
            .Take(20)
            .Select(u => new UserDto(u.Id, u.UserName, u.DisplayName))
            .ToListAsync(cancellationToken);

        return Results.Ok(users);
    }
}
