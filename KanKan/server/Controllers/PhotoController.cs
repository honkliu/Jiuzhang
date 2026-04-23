using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Models.DTOs.Photo;
using KanKan.API.Services.Implementations;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/photos")]
public class PhotoController : ControllerBase
{
    private readonly PhotoService _photoService;

    public PhotoController(PhotoService photoService)
    {
        _photoService = photoService;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    [HttpPost]
    public async Task<IActionResult> Upload([FromBody] PhotoCreateRequest request)
    {
        var photo = await _photoService.UploadAsync(GetUserId(), request);
        return CreatedAtAction(nameof(GetById), new { id = photo.Id }, photo);
    }

    [HttpPost("batch")]
    public async Task<IActionResult> UploadBatch([FromBody] PhotoUploadBatchRequest request)
    {
        var result = await _photoService.UploadBatchAsync(GetUserId(), request);
        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var photos = await _photoService.GetAllAsync(GetUserId());
        return Ok(photos);
    }

    [HttpGet("by-date-range")]
    public async Task<IActionResult> GetByDateRange([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {
        var photos = await _photoService.GetByDateRangeAsync(GetUserId(), startDate, endDate);
        return Ok(photos);
    }

    [HttpGet("by-upload-date")]
    public async Task<IActionResult> GetByUploadDate([FromQuery] DateTime? after = null, [FromQuery] DateTime? before = null, [FromQuery] int limit = 100)
    {
        var all = await _photoService.GetAllAsync(GetUserId());
        var filtered = all.Where(p =>
            (!after.HasValue || p.UploadedAt >= after.Value) &&
            (!before.HasValue || p.UploadedAt <= before.Value)
        ).OrderByDescending(p => p.UploadedAt).Take(limit).ToList();
        return Ok(filtered);
    }

    [HttpGet("by-captured-date")]
    public async Task<IActionResult> GetByCapturedDate([FromQuery] DateTime? after = null, [FromQuery] DateTime? before = null, [FromQuery] int limit = 100)
    {
        var all = await _photoService.GetAllAsync(GetUserId());
        var filtered = all.Where(p => p.CapturedDate.HasValue &&
            (!after.HasValue || p.CapturedDate.Value >= after.Value) &&
            (!before.HasValue || p.CapturedDate.Value <= before.Value)
        ).OrderByDescending(p => p.CapturedDate).Take(limit).ToList();
        return Ok(filtered);
    }

    [HttpGet("by-receipt/{receiptId}")]
    public async Task<IActionResult> GetByReceiptId(string receiptId)
    {
        var photos = await _photoService.GetByReceiptIdAsync(GetUserId(), receiptId);
        return Ok(photos);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var photo = await _photoService.GetByIdAsync(GetUserId(), id);
        if (photo == null) return NotFound();
        return Ok(photo);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] PhotoUpdateRequest request)
    {
        var photo = await _photoService.UpdateAsync(GetUserId(), id, request);
        return Ok(photo);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        await _photoService.DeleteAsync(GetUserId(), id);
        return NoContent();
    }

    [HttpGet("download/{id}")]
    public async Task<IActionResult> Download(string id)
    {
        try
        {
            var bytes = await _photoService.DownloadAsync(id);
            return File(bytes, "application/octet-stream");
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }
}
