using KanKan.API.Models.Entities;
using Microsoft.AspNetCore.Http;

namespace KanKan.API.Models.DTOs.Photo;

public class PhotoCreateRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? Base64Data { get; set; }
    public string? FilePath { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationName { get; set; }
    public string? CameraModel { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public List<string>? AssociatedReceiptIds { get; set; }
    public List<string>? Tags { get; set; }
    public string? Notes { get; set; }
}

public class PhotoUploadFormRequest
{
    public IFormFile File { get; set; } = default!;
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationName { get; set; }
    public string? CameraModel { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public List<string>? AssociatedReceiptIds { get; set; }
    public List<string>? Tags { get; set; }
    public string? Notes { get; set; }
}

public class PhotoUpdateRequest
{
    public string? FileName { get; set; }
    public List<string>? AssociatedReceiptIds { get; set; }
    public List<string>? Tags { get; set; }
    public string? Notes { get; set; }
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}

public class PhotoResponse
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? FilePath { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime UploadedAt { get; set; }
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationName { get; set; }
    public string? CameraModel { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public List<string> AssociatedReceiptIds { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public string? Notes { get; set; }
    public int ExtractedReceiptCount { get; set; }
    public string? LastOcrStatus { get; set; }
    public Dictionary<string, List<string>> PhotoReceiptDateIndex { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PhotoUploadBatchRequest
{
    public List<PhotoUploadBatchItem> Photos { get; set; } = new();
}

public class PhotoUploadBatchItem
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string Base64Data { get; set; } = string.Empty;
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationName { get; set; }
    public string? CameraModel { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public List<string>? AssociatedReceiptIds { get; set; }
    public List<string>? Tags { get; set; }
    public string? Notes { get; set; }
}

public class PhotoUploadBatchResponse
{
    public List<PhotoResponse> Photos { get; set; } = new();
    public int SuccessCount { get; set; }
    public int FailCount { get; set; }
    public List<string>? Errors { get; set; }
}

public static class PhotoDtosMapper
{
    private static string GetFileNameExtension(PhotoAlbum photo)
    {
        var contentType = photo.ContentType?.Trim().ToLowerInvariant();
        return contentType switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            "image/bmp" => ".bmp",
            "image/heic" => ".heic",
            "image/heif" => ".heif",
            _ => ".jpg",
        };
    }

    private static string ResolveStoredFileName(PhotoAlbum photo)
    {
        if (!string.IsNullOrWhiteSpace(photo.ImageUrl))
        {
            var imageUrl = photo.ImageUrl.Split('?', 2)[0];
            var fileName = imageUrl.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                return Uri.UnescapeDataString(fileName);
            }
        }

        if (!string.IsNullOrWhiteSpace(photo.FilePath))
        {
            var fileName = Path.GetFileName(photo.FilePath);
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                return fileName;
            }
        }

        return $"{photo.Id}{GetFileNameExtension(photo)}";
    }

    public static string? ToImageUrl(PhotoAlbum photo)
    {
        if (!string.IsNullOrWhiteSpace(photo.ImageUrl))
        {
            return photo.ImageUrl;
        }

        if (string.IsNullOrWhiteSpace(photo.FilePath))
        {
            return null;
        }

        var normalizedPath = photo.FilePath.Replace('\\', '/');
        const string marker = "/wwwroot/";
        var markerIndex = normalizedPath.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex >= 0)
        {
            return "/" + normalizedPath[(markerIndex + marker.Length)..];
        }

        var fileName = ResolveStoredFileName(photo);
        return !string.IsNullOrWhiteSpace(fileName)
            ? $"/photos/{Uri.EscapeDataString(fileName)}"
            : null;
    }

    public static PhotoResponse ToResponse(PhotoAlbum photo)
    {
        return new PhotoResponse
        {
            Id = photo.Id,
            OwnerId = photo.OwnerId,
            FileName = ResolveStoredFileName(photo),
            ContentType = photo.ContentType,
            FileSize = photo.FileSize,
            FilePath = photo.FilePath,
            ImageUrl = ToImageUrl(photo),
            UploadedAt = photo.UploadedAt,
            CapturedDate = photo.CapturedDate,
            Latitude = photo.Latitude,
            Longitude = photo.Longitude,
            LocationName = photo.LocationName,
            CameraModel = photo.CameraModel,
            Width = photo.Width,
            Height = photo.Height,
            AssociatedReceiptIds = photo.AssociatedReceiptIds,
            Tags = photo.Tags,
            Notes = photo.Notes,
            ExtractedReceiptCount = photo.ExtractedReceiptCount,
            LastOcrStatus = photo.LastOcrStatus,
            PhotoReceiptDateIndex = photo.PhotoReceiptDateIndex ?? new(),
            CreatedAt = photo.CreatedAt,
            UpdatedAt = photo.UpdatedAt,
        };
    }
}
