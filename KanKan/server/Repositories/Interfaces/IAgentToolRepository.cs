using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IAgentToolRepository
{
    Task<List<AgentTool>> GetAllEnabledAsync();
    Task<AgentTool?> GetByIdAsync(string id);
    Task<List<AgentTool>> GetAllAsync();
    Task CreateAsync(AgentTool tool);
    Task UpdateAsync(AgentTool tool);
    Task DeleteAsync(string id);
    Task BulkReplaceAsync(List<AgentTool> tools);
}
