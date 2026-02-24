using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models;

public class AvatarImage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("imageType")]
    public string ImageType { get; set; } = "original"; // "original" | "emotion_generated"

    [BsonElement("emotion")]
    public string? Emotion { get; set; } // null | "angry" | "smile" | "sad" | "happy" | "crying" | "thinking"

    [BsonElement("imageData")]
    public byte[]? ImageData { get; set; }

    [BsonElement("thumbnailData")]
    public byte[]? ThumbnailData { get; set; }

    [BsonElement("thumbnailContentType")]
    public string? ThumbnailContentType { get; set; }

    [BsonElement("contentType")]
    public string ContentType { get; set; } = string.Empty;

    [BsonElement("fileName")]
    public string FileName { get; set; } = string.Empty;

    [BsonElement("fileSize")]
    public long FileSize { get; set; }

    [BsonElement("sourceAvatarId")]
    public string? SourceAvatarId { get; set; } // Reference to original avatar if generated

    [BsonElement("generationPrompt")]
    public string? GenerationPrompt { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
