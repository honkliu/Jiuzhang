namespace KanShan.Server.Realtime;

public static class HubGroups
{
    public static string Conversation(Guid conversationId) => $"conv:{conversationId:D}";
    public static string User(Guid userId) => $"user:{userId:D}";
}
