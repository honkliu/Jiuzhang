using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace WeChat.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class MediaController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<MediaController> _logger;

    public MediaController(IWebHostEnvironment environment, ILogger<MediaController> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50 MB
    public async Task<IActionResult> Upload([FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided" });

            var uploadsPath = Path.Combine(_environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads");
            Directory.CreateDirectory(uploadsPath);

            var safeFileName = Path.GetFileName(file.FileName);
            var fileName = $"{Guid.NewGuid()}_{safeFileName}";
            var filePath = Path.Combine(uploadsPath, fileName);

            await using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var url = $"/uploads/{fileName}";

            return Ok(new
            {
                url,
                fileName = safeFileName,
                contentType = file.ContentType,
                size = file.Length
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload media");
            return StatusCode(500, new { message = "Failed to upload media" });
        }
    }
}
