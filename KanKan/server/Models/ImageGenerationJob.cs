using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models;

public class ImageGenerationJob
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("jobId")]
    public string JobId { get; set; } = Guid.NewGuid().ToString();

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("sourceType")]
    public string SourceType { get; set; } = string.Empty; // "avatar" | "chat_image"

    [BsonElement("sourceReference")]
    public SourceReference SourceRef { get; set; } = new();

    [BsonElement("generationType")]
    public string GenerationType { get; set; } = string.Empty; // "emotions" | "variations" | "custom"

    [BsonElement("emotion")]
    public string? Emotion { get; set; }

    [BsonElement("prompt")]
    public string Prompt { get; set; } = string.Empty;

    [BsonElement("comfyPromptId")]
    public string? ComfyPromptId { get; set; }

    [BsonElement("status")]
    public string Status { get; set; } = "pending"; // "pending" | "processing" | "completed" | "failed"

    [BsonElement("progress")]
    public int Progress { get; set; } = 0; // 0-100

    [BsonElement("results")]
    public GenerationResults Results { get; set; } = new();

    [BsonElement("errorMessage")]
    public string? ErrorMessage { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("completedAt")]
    public DateTime? CompletedAt { get; set; }
}

public class SourceReference
{
    [BsonElement("avatarId")]
    public string? AvatarId { get; set; }

    [BsonElement("messageId")]
    public string? MessageId { get; set; }

    [BsonElement("originalMediaUrl")]
    public string? OriginalMediaUrl { get; set; }
}

public class GenerationResults
{
    [BsonElement("avatarImageIds")]
    public List<string> AvatarImageIds { get; set; } = new();

    [BsonElement("generatedUrls")]
    public List<string> GeneratedUrls { get; set; } = new();
}
