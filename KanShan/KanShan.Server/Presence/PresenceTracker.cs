using System.Collections.Concurrent;

namespace KanShan.Server.Presence;

public interface IPresenceTracker
{
    void ConnectionOpened(Guid userId, string connectionId);
    void ConnectionClosed(Guid userId, string connectionId);
    bool IsOnline(Guid userId);
    IReadOnlyCollection<Guid> GetOnlineUsers(IEnumerable<Guid> userIds);
    IReadOnlyCollection<string> GetConnections(Guid userId);
}

public sealed class PresenceTracker : IPresenceTracker
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, byte>> _userConnections = new();

    public void ConnectionOpened(Guid userId, string connectionId)
    {
        if (userId == Guid.Empty) return;
        if (string.IsNullOrWhiteSpace(connectionId)) return;

        var connections = _userConnections.GetOrAdd(userId, _ => new ConcurrentDictionary<string, byte>());
        connections.TryAdd(connectionId, 0);
    }

    public void ConnectionClosed(Guid userId, string connectionId)
    {
        if (userId == Guid.Empty) return;
        if (string.IsNullOrWhiteSpace(connectionId)) return;

        if (_userConnections.TryGetValue(userId, out var connections))
        {
            connections.TryRemove(connectionId, out _);
            if (connections.IsEmpty)
            {
                _userConnections.TryRemove(userId, out _);
            }
        }
    }

    public bool IsOnline(Guid userId)
    {
        return userId != Guid.Empty && _userConnections.ContainsKey(userId);
    }

    public IReadOnlyCollection<Guid> GetOnlineUsers(IEnumerable<Guid> userIds)
    {
        var result = new List<Guid>();
        foreach (var id in userIds)
        {
            if (IsOnline(id)) result.Add(id);
        }
        return result;
    }

    public IReadOnlyCollection<string> GetConnections(Guid userId)
    {
        if (userId == Guid.Empty) return Array.Empty<string>();
        if (!_userConnections.TryGetValue(userId, out var connections)) return Array.Empty<string>();
        return connections.Keys.ToList();
    }
}
