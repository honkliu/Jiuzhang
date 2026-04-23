using System.Linq.Expressions;

namespace KanKan.API.Repositories.Interfaces;

/// <summary>
/// Generic repository interface for MongoDB-like operations.
/// Used to enable in-memory testing and mocking.
/// </summary>
public interface IRepository<TDocument> where TDocument : class
{
    Task<List<TDocument>> FindAsync(Expression<Func<TDocument, bool>> filter);
    Task<TDocument?> FindOneAsync(Expression<Func<TDocument, bool>> filter);
    Task InsertOneAsync(TDocument document);
    Task ReplaceOneAsync(Expression<Func<TDocument, bool>> filter, TDocument replacement);
    Task DeleteOneAsync(Expression<Func<TDocument, bool>> filter);
    Task UpsertAsync(TDocument document);
}
