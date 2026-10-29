using System.Collections.Concurrent;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// In-memory sliding-window rate limiter: N actions per window per key.
/// </summary>
public class RateLimiter
{
    private readonly ConcurrentDictionary<string, Queue<DateTime>> _hits = new();

    public bool Allow(string key, int limit, TimeSpan window)
    {
        var now = DateTime.UtcNow;
        var q = _hits.GetOrAdd(key, _ => new Queue<DateTime>());

        lock (q)
        {
            while (q.Count > 0 && now - q.Peek() > window) q.Dequeue();
            if (q.Count >= limit) return false;
            q.Enqueue(now);
            return true;
        }
    }

    public int Remaining(string key, int limit, TimeSpan window)
    {
        var now = DateTime.UtcNow;
        if (!_hits.TryGetValue(key, out var q)) return limit;
        lock (q)
        {
            while (q.Count > 0 && now - q.Peek() > window) q.Dequeue();
            return Math.Max(0, limit - q.Count);
        }
    }
}