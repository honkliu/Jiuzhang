using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/agent-tools")]
public class AgentToolsController : ControllerBase
{
    private readonly IAgentToolRepository _repo;

    public AgentToolsController(IAgentToolRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await _repo.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var tool = await _repo.GetByIdAsync(id);
        return tool is null ? NotFound() : Ok(tool);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AgentTool tool)
    {
        tool.Id = Guid.NewGuid().ToString();
        await _repo.CreateAsync(tool);
        return CreatedAtAction(nameof(GetById), new { id = tool.Id }, tool);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] AgentTool tool)
    {
        var existing = await _repo.GetByIdAsync(id);
        if (existing is null) return NotFound();
        tool.Id = id;
        tool.CreatedAt = existing.CreatedAt;
        await _repo.UpdateAsync(tool);
        return Ok(tool);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var existing = await _repo.GetByIdAsync(id);
        if (existing is null) return NotFound();
        await _repo.DeleteAsync(id);
        return NoContent();
    }

    [HttpPatch("{id}/toggle")]
    public async Task<IActionResult> Toggle(string id)
    {
        var tool = await _repo.GetByIdAsync(id);
        if (tool is null) return NotFound();
        tool.Enabled = !tool.Enabled;
        await _repo.UpdateAsync(tool);
        return Ok(tool);
    }

    [HttpPut("bulk")]
    public async Task<IActionResult> BulkReplace([FromBody] List<AgentTool> tools)
    {
        await _repo.BulkReplaceAsync(tools);
        return Ok(await _repo.GetAllAsync());
    }
}
