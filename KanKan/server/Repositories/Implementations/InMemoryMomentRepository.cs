using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class InMemoryMomentRepository : IMomentRepository
{
    private static readonly Dictionary<string, Moment> _moments = new();
    private static readonly object _lock = new();

    public Task<Moment?> GetByIdAsync(string id)
    {
        lock (_lock)
        {
            _moments.TryGetValue(id, out var moment);
            return Task.FromResult(moment);
        }
    }

    public Task<List<Moment>> GetFeedAsync(int limit = 50, DateTime? before = null)
    {
        lock (_lock)
        {
            var query = _moments.Values.AsEnumerable();
            if (before.HasValue)
            {
                query = query.Where(m => m.CreatedAt < before.Value);
            }

            var results = query
                .OrderByDescending(m => m.CreatedAt)
                .Take(limit)
                .ToList();

            return Task.FromResult(results);
        }
    }

    public Task<Moment> CreateAsync(Moment moment)
    {
        lock (_lock)
        {
            moment.CreatedAt = DateTime.UtcNow;
            _moments[moment.Id] = moment;
            return Task.FromResult(moment);
        }
    }

    public Task<Moment> UpdateAsync(Moment moment)
    {
        lock (_lock)
        {
            _moments[moment.Id] = moment;
            return Task.FromResult(moment);
        }
    }

    public Task DeleteAsync(string id)
    {
        lock (_lock)
        {
            _moments.Remove(id);
            return Task.CompletedTask;
        }
    }
}
