using Microsoft.Extensions.Options;

namespace KanShan.Server.Storage;

public interface IFileStorage
{
    Task<(string publicUrl, string relativePath)> SaveImageAsync(IFormFile file, CancellationToken cancellationToken);
    string GetUploadsPhysicalPath();
}

public sealed class LocalFileStorage : IFileStorage
{
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    };

    private readonly FileStorageOptions _options;
    private readonly IWebHostEnvironment _environment;

    public LocalFileStorage(IOptions<FileStorageOptions> options, IWebHostEnvironment environment)
    {
        _options = options.Value;
        _environment = environment;
    }

    public string GetUploadsPhysicalPath()
    {
        var physical = Path.Combine(_environment.ContentRootPath, _options.UploadsPath);
        Directory.CreateDirectory(physical);
        return physical;
    }

    public async Task<(string publicUrl, string relativePath)> SaveImageAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0)
        {
            throw new InvalidOperationException("Empty file");
        }

        if (!AllowedContentTypes.Contains(file.ContentType))
        {
            throw new InvalidOperationException($"Unsupported content type: {file.ContentType}");
        }

        if (file.Length > 10 * 1024 * 1024)
        {
            throw new InvalidOperationException("Image too large (max 10MB)");
        }

        var uploadsPhysical = GetUploadsPhysicalPath();

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = file.ContentType switch
            {
                "image/jpeg" => ".jpg",
                "image/png" => ".png",
                "image/gif" => ".gif",
                "image/webp" => ".webp",
                _ => ".img",
            };
        }

        var fileName = $"{DateTimeOffset.UtcNow:yyyyMMdd}/{Guid.NewGuid():N}{ext}";
        var relativePath = fileName.Replace('\\', '/');

        var physicalPath = Path.Combine(uploadsPhysical, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(physicalPath)!);

        await using var stream = File.Create(physicalPath);
        await file.CopyToAsync(stream, cancellationToken);

        var publicUrl = $"{_options.PublicBasePath.TrimEnd('/')}/{relativePath}";
        return (publicUrl, relativePath);
    }
}
