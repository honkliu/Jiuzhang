using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Repositories.Interfaces;

public interface IUserRepository
{
    Task<UserEntity?> GetByIdAsync(string id);
    Task<UserEntity?> GetByEmailAsync(string email);
    Task<UserEntity?> GetByRefreshTokenAsync(string token);
    Task<UserEntity> CreateAsync(UserEntity user);
    Task<UserEntity> UpdateAsync(UserEntity user);
    Task DeleteAsync(string id);
    Task<List<UserEntity>> SearchUsersAsync(string query, string excludeUserId, int limit = 20);
    Task<List<UserEntity>> GetAllUsersAsync(string excludeUserId, int limit = 100);
    Task<List<UserEntity>> GetUsersByDomainAsync(string domain, string excludeUserId, int limit = 200);
}
