namespace KanKan.API.Services.Interfaces;

public interface IEmailService
{
    Task SendVerificationEmailAsync(string toEmail, string code);
    Task SendPasswordResetEmailAsync(string toEmail, string code);
    Task SendWelcomeEmailAsync(string toEmail, string displayName);
}
