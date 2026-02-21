using KanKan.API.Models;

namespace KanKan.API.Services;

public interface IImageGenerationService
{
    /// <summary>
    /// Unified generation method for all image types
    /// </summary>
    Task<string> GenerateAsync(GenerationRequest request);

    /// <summary>
    /// Get job status
    /// </summary>
    Task<ImageGenerationJob?> GetJobStatusAsync(string jobId);

    /// <summary>
    /// Get generated avatars for a user
    /// </summary>
    Task<List<GeneratedAvatarResult>> GetGeneratedAvatarsAsync(string avatarIdOrUserId);

    /// <summary>
    /// Get variation URLs for a message
    /// </summary>
    Task<List<string>> GetVariationUrlsAsync(string messageId);
}

public class GenerationRequest
{
    public string UserId { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty; // "avatar" | "chat_image"
    public string? AvatarId { get; set; }
    public string? MessageId { get; set; }
    public string? MediaUrl { get; set; }
    public string GenerationType { get; set; } = string.Empty; // "emotions" | "styles" | "variations" | "custom"
    public string? Emotion { get; set; }
    public string? Mode { get; set; } // "create" | "replace"
    public int VariationCount { get; set; } = 9;
    public List<string>? CustomPrompts { get; set; }
    public string? ExtraPrompt { get; set; }
}

public class GeneratedAvatarResult
{
    public string AvatarImageId { get; set; } = string.Empty;
    public string? Emotion { get; set; }
    public string? Style { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
    public string SourceAvatarId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
