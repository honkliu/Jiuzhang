using WeChat.API.Repositories.Interfaces;
using UserEntity = WeChat.API.Models.Entities.User;

namespace WeChat.API.Repositories.Implementations;

/// <summary>
/// In-memory implementation of IUserRepository for development/testing without Cosmos DB
/// </summary>
public class InMemoryUserRepository : IUserRepository
{
    private static readonly Dictionary<string, UserEntity> _users = new();
    private static readonly object _lock = new();

    public Task<UserEntity?> GetByIdAsync(string id)
    {
        lock (_lock)
        {
            _users.TryGetValue(id, out var user);
            return Task.FromResult(user);
        }
    }

    public Task<UserEntity?> GetByEmailAsync(string email)
    {
        lock (_lock)
        {
            var user = _users.Values.FirstOrDefault(u => u.Email.Equals(email, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(user);
        }
    }

    public Task<UserEntity?> GetByRefreshTokenAsync(string token)
    {
        lock (_lock)
        {
            var user = _users.Values.FirstOrDefault(u =>
                u.RefreshTokens.Any(rt => rt.Token == token));
            return Task.FromResult(user);
        }
    }

    public Task<UserEntity> CreateAsync(UserEntity user)
    {
        lock (_lock)
        {
            user.CreatedAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;
            _users[user.Id] = user;
            return Task.FromResult(user);
        }
    }

    public Task<UserEntity> UpdateAsync(UserEntity user)
    {
        lock (_lock)
        {
            user.UpdatedAt = DateTime.UtcNow;
            _users[user.Id] = user;
            return Task.FromResult(user);
        }
    }

    public Task DeleteAsync(string id)
    {
        lock (_lock)
        {
            _users.Remove(id);
            return Task.CompletedTask;
        }
    }

    public Task<List<UserEntity>> SearchUsersAsync(string query, string excludeUserId, int limit = 20)
    {
        lock (_lock)
        {
            var lowerQuery = query.ToLower();
            var users = _users.Values
                .Where(u => u.Id != excludeUserId &&
                    (u.Email.ToLower().Contains(lowerQuery) ||
                     u.DisplayName.ToLower().Contains(lowerQuery)))
                .OrderBy(u => u.DisplayName)
                .Take(limit)
                .ToList();
            return Task.FromResult(users);
        }
    }

    public Task<List<UserEntity>> GetAllUsersAsync(string excludeUserId, int limit = 100)
    {
        lock (_lock)
        {
            var users = _users.Values
                .Where(u => u.Id != excludeUserId)
                .OrderBy(u => u.DisplayName)
                .Take(limit)
                .ToList();
            return Task.FromResult(users);
        }
    }
}
