using KanKan.API.Models.Entities;

namespace KanKan.API.Models.DTOs.Photo;

public class PhotoCreateRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? Base64Data { get; set; }
    public string? FilePath { get; set; }
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
    public static PhotoResponse ToResponse(PhotoAlbum photo)
    {
        return new PhotoResponse
        {
            Id = photo.Id,
            OwnerId = photo.OwnerId,
            FileName = photo.FileName,
            ContentType = photo.ContentType,
            FileSize = photo.FileSize,
            FilePath = photo.FilePath,
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
            CreatedAt = photo.CreatedAt,
            UpdatedAt = photo.UpdatedAt,
        };
    }
}
