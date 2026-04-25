using System.Security.Claims;
using System.Text;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Photo;
using KanKan.API.Repositories.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/admin/gallery")]
public class AdminGalleryController : ControllerBase
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif"
    };

    private readonly IUserRepository _userRepository;
    private readonly IWebHostEnvironment _environment;

    public AdminGalleryController(IUserRepository userRepository, IWebHostEnvironment environment)
    {
        _userRepository = userRepository;
        _environment = environment;
    }

    [HttpGet("photos")]
    public async Task<IActionResult> GetPhotos()
    {
        if (!await IsSuperUserAsync())
        {
            return Forbid();
        }

        var uploadsRoot = GetUploadsRoot();
        if (!Directory.Exists(uploadsRoot))
        {
            return Ok(Array.Empty<PhotoResponse>());
        }

        var photos = Directory.EnumerateFiles(uploadsRoot, "*", SearchOption.AllDirectories)
            .Where(IsImageFile)
            .Select(ToPhotoResponse)
            .OrderByDescending(photo => photo.UploadedAt)
            .ToList();

        return Ok(photos);
    }

    [HttpDelete("photos/{id}")]
    public async Task<IActionResult> DeletePhoto(string id)
    {
        if (!await IsSuperUserAsync())
        {
            return Forbid();
        }

        var filePath = ResolveGalleryFilePath(id);
        if (filePath == null || !IsImageFile(filePath))
        {
            return BadRequest(new { message = "Invalid gallery photo id." });
        }

        DeletePhotoFileAndGeneratedDescendants(filePath);
        return NoContent();
    }

    private async Task<bool> IsSuperUserAsync()
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(currentUserId))
        {
            return false;
        }

        var user = await _userRepository.GetByIdAsync(currentUserId);
        if (user == null || !user.IsAdmin)
        {
            return false;
        }

        var domain = string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
        return DomainRules.IsSuperDomain(domain);
    }

    private string GetWebRootPath()
    {
        return _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
    }

    private string GetUploadsRoot()
    {
        return Path.GetFullPath(Path.Combine(GetWebRootPath(), "uploads"));
    }

    private PhotoResponse ToPhotoResponse(string filePath)
    {
        var fileInfo = new FileInfo(filePath);
        var relativePath = Path.GetRelativePath(GetWebRootPath(), filePath)
            .Replace(Path.DirectorySeparatorChar, '/');
        var fileName = Path.GetFileName(filePath);
        var timestamp = fileInfo.LastWriteTimeUtc;

        return new PhotoResponse
        {
            Id = EncodeGalleryId(relativePath),
            OwnerId = "kankan@kankan",
            FileName = fileName,
            ContentType = GetContentType(filePath),
            FileSize = fileInfo.Length,
            FilePath = filePath,
            ImageUrl = ToPublicUrl(relativePath),
            UploadedAt = timestamp,
            CapturedDate = timestamp,
            AssociatedReceiptIds = new List<string>(),
            Tags = new List<string> { relativePath.StartsWith("uploads/receipts/", StringComparison.OrdinalIgnoreCase) ? "receipts" : "uploads" },
            Notes = relativePath,
            CreatedAt = timestamp,
            UpdatedAt = timestamp,
        };
    }

    private string? ResolveGalleryFilePath(string id)
    {
        var relativePath = DecodeGalleryId(id);
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        relativePath = relativePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var combinedPath = Path.GetFullPath(Path.Combine(GetWebRootPath(), relativePath));
        var uploadsRoot = GetUploadsRoot();

        if (!combinedPath.StartsWith(uploadsRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(combinedPath, uploadsRoot, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return combinedPath;
    }

    private static bool IsImageFile(string filePath)
    {
        return ImageExtensions.Contains(Path.GetExtension(filePath));
    }

    private static string ToPublicUrl(string relativePath)
    {
        return "/" + string.Join('/', relativePath
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString));
    }

    private static string GetContentType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".bmp" => "image/bmp",
            ".heic" => "image/heic",
            ".heif" => "image/heif",
            _ => "application/octet-stream",
        };
    }

    private static string EncodeGalleryId(string relativePath)
    {
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(relativePath))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? DecodeGalleryId(string id)
    {
        try
        {
            var base64 = id.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch
        {
            return null;
        }
    }

    private static void DeletePhotoFileAndGeneratedDescendants(string filePath)
    {
        var directory = Path.GetDirectoryName(filePath);
        var baseName = Path.GetFileNameWithoutExtension(filePath);
        var extension = Path.GetExtension(filePath);

        if (System.IO.File.Exists(filePath))
        {
            System.IO.File.Delete(filePath);
        }

        if (string.IsNullOrWhiteSpace(directory)
            || string.IsNullOrWhiteSpace(baseName)
            || string.IsNullOrWhiteSpace(extension)
            || !Directory.Exists(directory))
        {
            return;
        }

        var searchPattern = $"{baseName}_*{extension}";
        foreach (var generatedPath in Directory.EnumerateFiles(directory, searchPattern, SearchOption.TopDirectoryOnly))
        {
            var generatedBaseName = Path.GetFileNameWithoutExtension(generatedPath);
            if (IsGeneratedDescendantName(generatedBaseName, baseName))
            {
                System.IO.File.Delete(generatedPath);
            }
        }
    }

    private static bool IsGeneratedDescendantName(string generatedBaseName, string sourceBaseName)
    {
        if (!generatedBaseName.StartsWith(sourceBaseName + "_", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var suffix = generatedBaseName.Substring(sourceBaseName.Length + 1);
        var parts = suffix.Split('_', StringSplitOptions.None);
        return parts.Length > 0
            && parts.All(part => int.TryParse(part, out var index) && index > 0);
    }
}