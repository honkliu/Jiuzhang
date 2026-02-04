namespace WeChat.API.Models.Entities;

public class Moment
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "moment";
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserAvatar { get; set; } = string.Empty;
    public MomentContent Content { get; set; } = new();
    public string Visibility { get; set; } = "public"; // public, friends, private
    public DateTime CreatedAt { get; set; }
    public List<MomentLike> Likes { get; set; } = new();
    public List<MomentComment> Comments { get; set; } = new();
}

public class MomentContent
{
    public string? Text { get; set; }
    public List<string>? MediaUrls { get; set; }
    public string? Location { get; set; }
}

public class MomentLike
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class MomentComment
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserAvatar { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}
