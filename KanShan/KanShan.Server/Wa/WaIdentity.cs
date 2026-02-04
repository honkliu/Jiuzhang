namespace KanShan.Server.Wa;

public static class WaIdentity
{
    // Fixed id so the "wa" user is stable across restarts.
    public static readonly Guid UserId = Guid.Parse("2f5e2f5b-0b43-49d5-9c18-3a62b0f6f2c4");

    public const string UserName = "wa";

    public const string DisplayName = "娲";
}
