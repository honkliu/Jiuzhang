using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class AgentToolRepository : IAgentToolRepository
{
    private readonly IMongoCollection<AgentTool> _col;

    public AgentToolRepository(IMongoDatabase db)
    {
        _col = db.GetCollection<AgentTool>("AgentTools");
    }

    public async Task<List<AgentTool>> GetAllEnabledAsync() =>
        await _col.Find(t => t.Enabled).ToListAsync();

    public async Task<List<AgentTool>> GetAllAsync() =>
        await _col.Find(FilterDefinition<AgentTool>.Empty).ToListAsync();

    public async Task<AgentTool?> GetByIdAsync(string id) =>
        await _col.Find(t => t.Id == id).FirstOrDefaultAsync();

    public async Task CreateAsync(AgentTool tool)
    {
        tool.CreatedAt = DateTime.UtcNow;
        tool.UpdatedAt = DateTime.UtcNow;
        await _col.InsertOneAsync(tool);
    }

    public async Task UpdateAsync(AgentTool tool)
    {
        tool.UpdatedAt = DateTime.UtcNow;
        await _col.ReplaceOneAsync(t => t.Id == tool.Id, tool, new ReplaceOptions { IsUpsert = false });
    }

    public async Task DeleteAsync(string id) =>
        await _col.DeleteOneAsync(t => t.Id == id);

    public async Task BulkReplaceAsync(List<AgentTool> tools)
    {
        var now = DateTime.UtcNow;
        foreach (var t in tools)
        {
            if (string.IsNullOrWhiteSpace(t.Id)) t.Id = Guid.NewGuid().ToString();
            t.UpdatedAt = now;
            if (t.CreatedAt == default) t.CreatedAt = now;
        }

        await _col.DeleteManyAsync(FilterDefinition<AgentTool>.Empty);
        if (tools.Count > 0)
            await _col.InsertManyAsync(tools);
    }
}
