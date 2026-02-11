using KanKan.API.Models.Entities;

namespace KanKan.API.Models.DTOs.Moment;

public class MomentDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserAvatar { get; set; } = string.Empty;
    public MomentContent Content { get; set; } = new();
    public string Visibility { get; set; } = "public";
    public DateTime CreatedAt { get; set; }
    public List<MomentLike> Likes { get; set; } = new();
    public List<MomentComment> Comments { get; set; } = new();
}

public class CreateMomentRequest
{
    public string? Text { get; set; }
    public List<string>? MediaUrls { get; set; }
    public string? Location { get; set; }
    public string? Visibility { get; set; }
}

public class AddMomentCommentRequest
{
    public string Text { get; set; } = string.Empty;
}
