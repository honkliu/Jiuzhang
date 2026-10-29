namespace KanKan.API.Repositories.Homm;

/// <summary>
/// A deferred, in-memory query over HoMM entities. It mirrors the subset of the EF Core
/// query API the game services use, so their code reads the same as before the port.
/// </summary>
public sealed class HommQuery<T>
{
    private readonly Func<Task<IEnumerable<T>>> _source;

    public HommQuery(Func<Task<IEnumerable<T>>> source) => _source = source;

    private HommQuery<TR> Then<TR>(Func<IEnumerable<T>, IEnumerable<TR>> f) =>
        new(async () => f(await _source()));

    public HommQuery<T> Where(Func<T, bool> predicate) => Then(e => e.Where(predicate));
    public HommQuery<TR> Select<TR>(Func<T, TR> selector) => Then(e => e.Select(selector));
    public HommQuery<TR> SelectMany<TR>(Func<T, IEnumerable<TR>> selector) => Then(e => e.SelectMany(selector));
    public HommQuery<T> OrderBy<TK>(Func<T, TK> key) => Then(e => (IEnumerable<T>)e.OrderBy(key));
    public HommQuery<T> OrderByDescending<TK>(Func<T, TK> key) => Then(e => (IEnumerable<T>)e.OrderByDescending(key));
    public HommQuery<T> ThenBy<TK>(Func<T, TK> key) => Then(e => (IEnumerable<T>)((IOrderedEnumerable<T>)e).ThenBy(key));
    public HommQuery<T> ThenByDescending<TK>(Func<T, TK> key) => Then(e => (IEnumerable<T>)((IOrderedEnumerable<T>)e).ThenByDescending(key));
    public HommQuery<T> Take(int count) => Then(e => e.Take(count));
    public HommQuery<T> Skip(int count) => Then(e => e.Skip(count));
    public HommQuery<T> Distinct() => Then(e => e.Distinct());

    public async Task<List<T>> ToListAsync(CancellationToken ct = default) => (await _source()).ToList();
    public async Task<T[]> ToArrayAsync(CancellationToken ct = default) => (await _source()).ToArray();
    public async Task<T?> FirstOrDefaultAsync(CancellationToken ct = default) => (await _source()).FirstOrDefault();
    public async Task<T?> FirstOrDefaultAsync(Func<T, bool> predicate, CancellationToken ct = default) => (await _source()).FirstOrDefault(predicate);
    public async Task<T> FirstAsync(CancellationToken ct = default) => (await _source()).First();
    public async Task<T> FirstAsync(Func<T, bool> predicate, CancellationToken ct = default) => (await _source()).First(predicate);
    public async Task<bool> AnyAsync(CancellationToken ct = default) => (await _source()).Any();
    public async Task<bool> AnyAsync(Func<T, bool> predicate, CancellationToken ct = default) => (await _source()).Any(predicate);
    public async Task<int> CountAsync(CancellationToken ct = default) => (await _source()).Count();
    public async Task<int> CountAsync(Func<T, bool> predicate, CancellationToken ct = default) => (await _source()).Count(predicate);
    public async Task<int> SumAsync(Func<T, int> selector, CancellationToken ct = default) => (await _source()).Sum(selector);
}
