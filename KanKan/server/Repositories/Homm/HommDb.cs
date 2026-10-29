using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using KanKan.API.Models.Entities.Homm;
using MongoDB.Bson;
using MongoDB.Driver;

namespace KanKan.API.Repositories.Homm;

/// <summary>
/// Scoped unit of work for the HoMM game. Each game is one MongoDB document (the game plus its
/// players, heroes, towns, shared projects and trade offers); social content lives in separate
/// collections. The API mirrors the subset of the EF Core DbContext the services were written
/// against: sets lazily load the owning game aggregate when queried by an id, changes are tracked
/// in memory, and <see cref="SaveChangesAsync"/> writes modified games with an optimistic version check.
/// </summary>
public sealed class HommDb
{
    private sealed class Tracked
    {
        public required Game Game;
        public long Version;
        public byte[]? Snapshot;
        public bool IsNew;
    }

    private readonly IMongoCollection<Game> _games;
    private readonly Dictionary<Guid, Tracked> _tracked = new();
    private readonly List<Func<Task>> _pendingInserts = new();

    public HommGameSet Games { get; }
    public HommChildSet<Player> Players { get; }
    public HommChildSet<Hero> Heroes { get; }
    public HommChildSet<Town> Towns { get; }
    public HommChildSet<SharedProject> SharedProjects { get; }
    public HommChildSet<TradeOffer> TradeOffers { get; }

    public HommSocialSet<Post> Posts { get; }
    public HommSocialSet<Comment> Comments { get; }
    public HommSocialSet<WallMessage> WallMessages { get; }
    public HommSocialSet<TowerMessage> TowerMessages { get; }
    public HommSocialSet<ObeliskMessage> ObeliskMessages { get; }
    public HommSocialSet<MapAnnotation> MapAnnotations { get; }
    public HommSocialSet<HeroMessage> HeroMessages { get; }

    public HommChangeTracker ChangeTracker { get; }

    public HommDb(IMongoClient client, IConfiguration configuration)
    {
        HommBson.Register();
        var database = client.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _games = database.GetCollection<Game>(HommCollections.Name(configuration, HommCollections.Games));

        Games = new HommGameSet(this);
        Players = new HommChildSet<Player>(this, g => g.Players, p => p.GameId, "Players");
        Heroes = new HommChildSet<Hero>(this, g => g.Heroes, h => h.GameId, "Heroes");
        Towns = new HommChildSet<Town>(this, g => g.Towns, t => t.GameId, "Towns");
        SharedProjects = new HommChildSet<SharedProject>(this, g => g.SharedProjects, p => p.GameId, "SharedProjects");
        TradeOffers = new HommChildSet<TradeOffer>(this, g => g.TradeOffers, o => o.GameId, "TradeOffers");

        HommSocialSet<T> Social<T>(string name) where T : class =>
            new(this, database.GetCollection<T>(HommCollections.Name(configuration, name)));
        Posts = Social<Post>(HommCollections.Posts);
        Comments = Social<Comment>(HommCollections.Comments);
        WallMessages = Social<WallMessage>(HommCollections.WallMessages);
        TowerMessages = Social<TowerMessage>(HommCollections.TowerMessages);
        ObeliskMessages = Social<ObeliskMessage>(HommCollections.ObeliskMessages);
        MapAnnotations = Social<MapAnnotation>(HommCollections.MapAnnotations);
        HeroMessages = Social<HeroMessage>(HommCollections.HeroMessages);

        ChangeTracker = new HommChangeTracker(this);
    }

    internal IMongoCollection<Game> GameCollection => _games;
    internal IEnumerable<Game> LoadedGames => _tracked.Values.Select(t => t.Game);
    internal Game? Loaded(Guid id) => _tracked.TryGetValue(id, out var t) ? t.Game : null;

    // ---------------------------------------------------------------- loading
    internal Game Track(Game game)
    {
        if (_tracked.TryGetValue(game.Id, out var existing)) return existing.Game;
        _tracked[game.Id] = new Tracked { Game = game, Version = game.Version, Snapshot = Snapshot(game) };
        return game;
    }

    internal async Task<List<Game>> LoadAsync(FilterDefinition<Game> filter)
    {
        var docs = await _games.Find(filter).ToListAsync();
        return docs.Select(Track).ToList();
    }

    /// <summary>Loads (or returns the already loaded) game aggregate.</summary>
    public async Task<Game?> LoadGameAsync(Guid id)
    {
        if (Loaded(id) is { } g) return g;
        return (await LoadAsync(new BsonDocument("_id", id.ToString()))).FirstOrDefault();
    }

    /// <summary>Games for the lobby list: everything except the heavy map, fog and child state. Not tracked.</summary>
    public Task<List<Game>> ListGameSummariesAsync() =>
        _games.Find(FilterDefinition<Game>.Empty)
            .Project<Game>(Builders<Game>.Projection
                .Exclude(nameof(Game.MapJson))
                .Exclude(nameof(Game.Heroes))
                .Exclude(nameof(Game.Towns))
                .Exclude(nameof(Game.SharedProjects))
                .Exclude(nameof(Game.TradeOffers))
                .Exclude("Players.FogJson"))
            .ToListAsync();

    public async Task<bool> AnyGameInProgressAsync(CancellationToken ct = default) =>
        await _games.CountDocumentsAsync(new BsonDocument("State", nameof(GameState.InProgress)),
            new CountOptions { Limit = 1 }, ct) > 0;

    /// <summary>In-progress games whose turn timer has run out, fully loaded.</summary>
    public async Task<List<Game>> LoadGamesDueAsync(DateTime now)
    {
        var heads = await _games.Find(new BsonDocument("State", nameof(GameState.InProgress)))
            .Project(Builders<Game>.Projection.Include(nameof(Game.TurnStartedAt)).Include(nameof(Game.TurnSeconds)))
            .ToListAsync();
        var due = new List<Game>();
        foreach (var head in heads)
        {
            var started = head.GetValue(nameof(Game.TurnStartedAt), BsonNull.Value);
            var seconds = head.GetValue(nameof(Game.TurnSeconds), 300).ToInt32();
            if (started.IsValidDateTime && (now - started.ToUniversalTime()).TotalSeconds < seconds) continue;
            if (!Guid.TryParse(head["_id"].ToString(), out var id)) continue;
            if (await LoadGameAsync(id) is { State: GameState.InProgress } game) due.Add(game);
        }
        return due;
    }

    // ---------------------------------------------------------------- tracking
    internal void AddGame(Game game)
    {
        _tracked[game.Id] = new Tracked { Game = game, IsNew = true };
    }

    /// <summary>Forgets a loaded game and its pending changes.</summary>
    public void Detach(Guid gameId) => _tracked.Remove(gameId);

    internal void Clear()
    {
        _tracked.Clear();
        _pendingInserts.Clear();
    }

    internal void QueueInsert(Func<Task> insert) => _pendingInserts.Add(insert);

    private static byte[] Snapshot(Game game)
    {
        HommCompressedStringSerializer.PlainMode = true;
        try { return game.ToBson(); }
        finally { HommCompressedStringSerializer.PlainMode = false; }
    }

    /// <summary>
    /// Inserts new games, replaces modified ones (only if their stored version is unchanged) and writes queued
    /// social content. Throws <see cref="HommConcurrencyException"/> when a game was changed by someone else.
    /// </summary>
    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var written = 0;
        foreach (var t in _tracked.Values.ToList())
        {
            var game = t.Game;
            if (t.IsNew)
            {
                game.Version = 1;
                await _games.InsertOneAsync(game, cancellationToken: ct);
                t.IsNew = false;
                t.Version = 1;
                t.Snapshot = Snapshot(game);
                written++;
                continue;
            }

            if (t.Snapshot != null && Snapshot(game).AsSpan().SequenceEqual(t.Snapshot)) continue;
            game.Version = t.Version + 1;
            var filter = Builders<Game>.Filter.Eq(g => g.Id, game.Id) & Builders<Game>.Filter.Eq(g => g.Version, t.Version);
            var result = await _games.ReplaceOneAsync(filter, game, cancellationToken: ct);
            if (result.MatchedCount == 0)
            {
                game.Version = t.Version;
                throw new HommConcurrencyException($"Game {game.Id} was modified by another request.");
            }
            t.Version = game.Version;
            t.Snapshot = Snapshot(game);
            written++;
        }

        var inserts = _pendingInserts.ToList();
        _pendingInserts.Clear();
        foreach (var insert in inserts) await insert();
        return written + inserts.Count;
    }
}

/// <summary>Stand-in for EF's ChangeTracker: clearing drops every loaded game and pending change.</summary>
public sealed class HommChangeTracker
{
    private readonly HommDb _db;
    internal HommChangeTracker(HommDb db) => _db = db;
    public void Clear() => _db.Clear();
}

public static class HommCollections
{
    public const string Games = "HommGames";
    public const string Posts = "HommPosts";
    public const string Comments = "HommComments";
    public const string WallMessages = "HommWallMessages";
    public const string TowerMessages = "HommTowerMessages";
    public const string ObeliskMessages = "HommObeliskMessages";
    public const string MapAnnotations = "HommMapAnnotations";
    public const string HeroMessages = "HommHeroMessages";

    public static string Name(IConfiguration configuration, string name) =>
        configuration[$"MongoDB:Collections:{name}"] ?? name;
}

/// <summary>Finds <c>x.Member == value</c> / <c>values.Contains(x.Member)</c> Guid conditions in a predicate.</summary>
internal static class HommKeys
{
    public static List<(string Member, List<Guid> Values)> Extract(LambdaExpression predicate)
    {
        var finder = new Finder(predicate.Parameters[0]);
        finder.Visit(predicate.Body);
        return finder.Keys;
    }

    private sealed class Finder(ParameterExpression parameter) : ExpressionVisitor
    {
        public readonly List<(string, List<Guid>)> Keys = new();

        private string? MemberOf(Expression e)
        {
            while (e is UnaryExpression { NodeType: ExpressionType.Convert } u) e = u.Operand;
            return e is MemberExpression { Expression: ParameterExpression p } m && p == parameter
                   && (m.Type == typeof(Guid) || m.Type == typeof(Guid?))
                ? m.Member.Name
                : null;
        }

        private bool UsesParameter(Expression e)
        {
            var uses = false;
            new ParamFinder(parameter, () => uses = true).Visit(e);
            return uses;
        }

        private static object? Evaluate(Expression e)
        {
            if (e is ConstantExpression c) return c.Value;
            if (e is MemberExpression { Member: FieldInfo f } fm)
                return f.GetValue(fm.Expression == null ? null : Evaluate(fm.Expression));
            if (e is MemberExpression { Member: PropertyInfo p } pm)
                return p.GetValue(pm.Expression == null ? null : Evaluate(pm.Expression));
            return Expression.Lambda<Func<object?>>(Expression.Convert(e, typeof(object))).Compile()();
        }

        protected override Expression VisitBinary(BinaryExpression node)
        {
            if (node.NodeType == ExpressionType.Equal)
            {
                var (member, other) = MemberOf(node.Left) is { } l ? (l, node.Right)
                    : MemberOf(node.Right) is { } r ? (r, node.Left) : (null, null);
                if (member != null && other != null && !UsesParameter(other))
                {
                    try
                    {
                        if (Evaluate(other) is Guid g) Keys.Add((member, [g]));
                    }
                    catch { /* not a usable key */ }
                    return node;
                }
            }
            return base.VisitBinary(node);
        }

        protected override Expression VisitMethodCall(MethodCallExpression node)
        {
            if (node.Method.Name == "Contains")
            {
                var (source, item) = node.Object != null && node.Arguments.Count == 1 ? (node.Object, node.Arguments[0])
                    : node.Object == null && node.Arguments.Count == 2 ? (node.Arguments[0], node.Arguments[1]) : (null, null);
                if (source != null && item != null && MemberOf(item) is { } member && !UsesParameter(source))
                {
                    try
                    {
                        if (Evaluate(source) is IEnumerable values)
                            Keys.Add((member, values.OfType<Guid>().ToList()));
                    }
                    catch { /* not a usable key */ }
                    return node;
                }
            }
            return base.VisitMethodCall(node);
        }
    }

    private sealed class ParamFinder(ParameterExpression parameter, Action found) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node)
        {
            if (node == parameter) found();
            return node;
        }
    }
}

/// <summary>The games themselves.</summary>
public sealed class HommGameSet
{
    private readonly HommDb _db;
    internal HommGameSet(HommDb db) => _db = db;

    public IEnumerable<Game> Local => _db.LoadedGames;

    private async Task<IEnumerable<Game>> SourceAsync(Expression<Func<Game, bool>>? predicate)
    {
        if (predicate == null) return await _db.LoadAsync(FilterDefinition<Game>.Empty);
        var ids = HommKeys.Extract(predicate).Where(k => k.Member == nameof(Game.Id)).SelectMany(k => k.Values).ToList();
        if (ids.Count == 0) return await _db.LoadAsync(Builders<Game>.Filter.Where(predicate));
        var games = new List<Game>();
        foreach (var id in ids.Distinct())
            if (await _db.LoadGameAsync(id) is { } g) games.Add(g);
        return games;
    }

    public HommQuery<Game> Where(Expression<Func<Game, bool>> predicate)
    {
        var f = predicate.Compile();
        return new HommQuery<Game>(async () => (await SourceAsync(predicate)).Where(f));
    }

    public Task<List<Game>> ToListAsync(CancellationToken ct = default) => new HommQuery<Game>(() => SourceAsync(null)).ToListAsync(ct);
    public Task<Game?> FirstOrDefaultAsync(Expression<Func<Game, bool>> predicate, CancellationToken ct = default) => Where(predicate).FirstOrDefaultAsync(ct);
    public Task<Game> FirstAsync(Expression<Func<Game, bool>> predicate, CancellationToken ct = default) => Where(predicate).FirstAsync(ct);
    public Task<int> CountAsync(Expression<Func<Game, bool>> predicate, CancellationToken ct = default) => Where(predicate).CountAsync(ct);

    public async Task<bool> AnyAsync(Expression<Func<Game, bool>> predicate, CancellationToken ct = default)
    {
        if (HommKeys.Extract(predicate).Any(k => k.Member == nameof(Game.Id))) return await Where(predicate).AnyAsync(ct);
        return await _db.GameCollection.CountDocumentsAsync(Builders<Game>.Filter.Where(predicate), new CountOptions { Limit = 1 }, ct) > 0;
    }

    public void Add(Game game) => _db.AddGame(game);
}

/// <summary>Entities embedded in a game document (players, heroes, towns, projects, trade offers).</summary>
public sealed class HommChildSet<T> where T : class
{
    private readonly HommDb _db;
    private readonly Func<Game, List<T>> _list;
    private readonly Func<T, Guid> _gameId;
    private readonly Dictionary<string, (string Path, Func<T, Guid> Get)> _keys = new();

    internal HommChildSet(HommDb db, Func<Game, List<T>> list, Func<T, Guid> gameId, string arrayName)
    {
        _db = db;
        _list = list;
        _gameId = gameId;
        // Members whose value identifies the owning game document, and where to find it in MongoDB.
        void Key(string member, string path)
        {
            var prop = typeof(T).GetProperty(member);
            if (prop?.PropertyType == typeof(Guid)) _keys[member] = (path, e => (Guid)prop.GetValue(e)!);
        }
        Key("Id", $"{arrayName}._id");
        Key("GameId", "_id");
        Key("PlayerId", "Players._id");
        Key("FromPlayerId", "Players._id");
        Key("ToPlayerId", "Players._id");
    }

    private IEnumerable<T> All => _db.LoadedGames.SelectMany(_list);

    /// <summary>Entities of every loaded game, including ones added in this unit of work.</summary>
    public IEnumerable<T> Local => All;

    private async Task EnsureLoadedAsync(LambdaExpression predicate)
    {
        foreach (var (member, values) in HommKeys.Extract(predicate))
        {
            if (!_keys.TryGetValue(member, out var key)) continue;
            foreach (var value in values.Distinct())
            {
                if (value == Guid.Empty) continue;
                if (key.Path == "_id")
                {
                    await _db.LoadGameAsync(value);
                    continue;
                }
                if (All.Any(e => key.Get(e) == value)) continue;
                if (key.Path == "Players._id" && _db.LoadedGames.Any(g => g.Players.Any(p => p.Id == value))) continue;
                await _db.LoadAsync(new BsonDocument(key.Path, value.ToString()));
            }
        }
    }

    public HommQuery<T> Where(Expression<Func<T, bool>> predicate)
    {
        var f = predicate.Compile();
        return new HommQuery<T>(async () =>
        {
            await EnsureLoadedAsync(predicate);
            return All.Where(f);
        });
    }

    /// <summary>All entities of the loaded games.</summary>
    public Task<List<T>> ToListAsync(CancellationToken ct = default) => Task.FromResult(All.ToList());
    public Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) => Where(predicate).FirstOrDefaultAsync(ct);
    public Task<T> FirstAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) => Where(predicate).FirstAsync(ct);
    public Task<bool> AnyAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) => Where(predicate).AnyAsync(ct);
    public Task<int> CountAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) => Where(predicate).CountAsync(ct);

    public void Add(T entity)
    {
        var game = _db.Loaded(_gameId(entity))
                   ?? throw new InvalidOperationException($"Game {_gameId(entity)} must be loaded before adding a {typeof(T).Name}.");
        _list(game).Add(entity);
    }

    public void AddRange(IEnumerable<T> entities)
    {
        foreach (var e in entities) Add(e);
    }

    public void Remove(T entity)
    {
        foreach (var game in _db.LoadedGames) _list(game).Remove(entity);
    }
}

/// <summary>Insert-only social content stored in its own collection.</summary>
public sealed class HommSocialSet<T> where T : class
{
    private readonly HommDb _db;
    public IMongoCollection<T> Collection { get; }

    internal HommSocialSet(HommDb db, IMongoCollection<T> collection)
    {
        _db = db;
        Collection = collection;
    }

    public HommQuery<T> Where(Expression<Func<T, bool>> predicate) =>
        new(async () => await Collection.Find(predicate).ToListAsync());

    public async Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) =>
        await Collection.Find(predicate).FirstOrDefaultAsync(ct);

    public async Task<bool> AnyAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) =>
        await Collection.CountDocumentsAsync(predicate, new CountOptions { Limit = 1 }, ct) > 0;

    public async Task<int> CountAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default) =>
        (int)await Collection.CountDocumentsAsync(predicate, cancellationToken: ct);

    public void Add(T entity) => _db.QueueInsert(() => Collection.InsertOneAsync(entity));
}
