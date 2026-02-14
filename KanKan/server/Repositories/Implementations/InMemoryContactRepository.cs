using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class InMemoryContactRepository : IContactRepository
{
    private static readonly Dictionary<string, Contact> _contacts = new();
    private static readonly object _lock = new();

    public Task<Contact?> GetByIdAsync(string id, string userId)
    {
        lock (_lock)
        {
            if (_contacts.TryGetValue(id, out var contact) && contact.UserId == userId)
                return Task.FromResult<Contact?>(contact);
            return Task.FromResult<Contact?>(null);
        }
    }

    public Task<Contact?> GetByUserAndContactAsync(string userId, string contactId)
    {
        lock (_lock)
        {
            var contact = _contacts.Values.FirstOrDefault(c => c.UserId == userId && c.ContactId == contactId);
            return Task.FromResult(contact);
        }
    }

    public Task<List<Contact>> GetContactsByStatusAsync(string userId, string status)
    {
        lock (_lock)
        {
            var results = _contacts.Values
                .Where(c => c.UserId == userId && c.Status == status)
                .OrderByDescending(c => c.AddedAt)
                .ToList();
            return Task.FromResult(results);
        }
    }

    public Task<Contact> UpsertAsync(Contact contact)
    {
        lock (_lock)
        {
            _contacts[contact.Id] = contact;
            return Task.FromResult(contact);
        }
    }

    public Task DeleteAsync(string id, string userId)
    {
        lock (_lock)
        {
            if (_contacts.TryGetValue(id, out var contact) && contact.UserId == userId)
            {
                _contacts.Remove(id);
            }
            return Task.CompletedTask;
        }
    }

    public Task DeleteAllForUserAsync(string userId)
    {
        lock (_lock)
        {
            var keys = _contacts
                .Where(kvp => kvp.Value.UserId == userId || kvp.Value.ContactId == userId)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in keys)
            {
                _contacts.Remove(key);
            }

            return Task.CompletedTask;
        }
    }
}
