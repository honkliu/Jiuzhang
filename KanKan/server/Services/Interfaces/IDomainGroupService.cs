using KanKan.API.Models.Entities;

namespace KanKan.API.Services.Interfaces;

public interface IDomainGroupService
{
    Task<Chat?> EnsureDomainGroupForUserAsync(User user);
    string BuildDomainGroupChatId(string domain);
    bool IsDomainGroupChatId(string chatId);
}
