using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IMomentRepository
{
    Task<List<Moment>> GetFeedAsync(int limit = 50, DateTime? before = null);
    Task<Moment?> GetByIdAsync(string id);
    Task<Moment> CreateAsync(Moment moment);
    Task<Moment> UpdateAsync(Moment moment);
    Task DeleteAsync(string id);
}
