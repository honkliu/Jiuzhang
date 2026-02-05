using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IContactRepository
{
    Task<Contact?> GetByIdAsync(string id, string userId);
    Task<Contact?> GetByUserAndContactAsync(string userId, string contactId);
    Task<List<Contact>> GetContactsByStatusAsync(string userId, string status);
    Task<Contact> UpsertAsync(Contact contact);
    Task DeleteAsync(string id, string userId);
}
