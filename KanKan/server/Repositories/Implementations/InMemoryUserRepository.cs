using KanKan.API.Domain;
using KanKan.API.Repositories.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// In-memory implementation of IUserRepository for development/testing without MongoDB
/// </summary>
public class InMemoryUserRepository : IUserRepository
{
    private static readonly Dictionary<string, UserEntity> _users = new();
    private static readonly Dictionary<string, string> _userIdByEmail = new();
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
            var normalized = email.ToLower();
            if (_userIdByEmail.TryGetValue(normalized, out var userId) && _users.TryGetValue(userId, out var user))
            {
                return Task.FromResult<UserEntity?>(user);
            }

            var fallback = _users.Values.FirstOrDefault(u => u.Email.Equals(email, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(fallback);
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
            if (!string.IsNullOrWhiteSpace(user.Email))
            {
                _userIdByEmail[user.Email.ToLower()] = user.Id;
            }
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
            if (_users.TryGetValue(id, out var user) && !string.IsNullOrWhiteSpace(user.Email))
            {
                _userIdByEmail.Remove(user.Email.ToLower());
            }
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
                    (u.Handle.ToLower().Contains(lowerQuery) ||
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

    public Task<List<UserEntity>> GetUsersByDomainAsync(string domain, string excludeUserId, int limit = 200)
    {
        lock (_lock)
        {
            var normalized = DomainRules.Normalize(domain);
            var users = _users.Values
                .Where(u => u.Id != excludeUserId && string.Equals(ResolveDomain(u), normalized, StringComparison.Ordinal))
                .OrderBy(u => u.DisplayName)
                .Take(limit)
                .ToList();
            return Task.FromResult(users);
        }
    }

    private static string ResolveDomain(UserEntity user)
    {
        return string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
    }
}
