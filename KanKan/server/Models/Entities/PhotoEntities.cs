using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models.Entities;

/// <summary>
/// Represents a photo attached to a medical or shopping receipt, stored in MongoDB.
/// </summary>
[BsonIgnoreExtraElements]
public class PhotoAlbum
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>File name for download</summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>MIME type (image/jpeg, image/png, etc.)</summary>
    public string ContentType { get; set; } = string.Empty;

    /// <summary>File size in bytes</summary>
    public long FileSize { get; set; }

    /// <summary>Base64-encoded image data (for small images) or GridFS reference</summary>
    public string? Base64Data { get; set; }

    /// <summary>Relative storage path for files stored on disk</summary>
    public string? FilePath { get; set; }

    /// <summary>Original upload date (UTC)</summary>
    public DateTime UploadedAt { get; set; }

    /// <summary>Camera-captured date extracted from EXIF, if available</summary>
    public DateTime? CapturedDate { get; set; }

    /// <summary>GPS coordinates if embedded in EXIF</summary>
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    /// <summary>GPS location name, if available</summary>
    public string? LocationName { get; set; }

    /// <summary>Camera make/model from EXIF</summary>
    public string? CameraModel { get; set; }

    /// <summary>Resolution dimensions</summary>
    public int? Width { get; set; }
    public int? Height { get; set; }

    /// <summary>IDs of receipts this photo is associated with</summary>
    public List<string> AssociatedReceiptIds { get; set; } = new();

    /// <summary>Tags set by the user</summary>
    public List<string> Tags { get; set; } = new();

    /// <summary>User-provided notes</summary>
    public string? Notes { get; set; }

    // ── Phase 5 新增字段 ──

    /// <summary>从该照片提取的收据数量 (派生字段)</summary>
    public int ExtractedReceiptCount { get; set; }

    /// <summary>上次 OCR 状态: Pending | Processing | Completed | Failed</summary>
    public string LastOcrStatus { get; set; } = "Pending";

    /// <summary>按收据日期的反查索引, 映射 YYYY-MM -> [receiptId, ...]</summary>
    public Dictionary<string, List<string>>? PhotoReceiptDateIndex { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
