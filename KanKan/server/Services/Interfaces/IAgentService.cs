namespace KanKan.API.Services.Interfaces;

public interface IAgentService
{
    Task<string> GenerateReplyAsync(string chatId, string userMessage, IEnumerable<(string SenderName, string Message)> history);
    IAsyncEnumerable<string> StreamReplyAsync(string chatId, string userMessage, IEnumerable<(string SenderName, string Message)> history);
}
