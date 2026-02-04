using SendGrid;
using SendGrid.Helpers.Mail;
using WeChat.API.Services.Interfaces;

namespace WeChat.API.Services.Implementations;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;
    private readonly SendGridClient _sendGridClient;

    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;

        var apiKey = configuration["Email:ApiKey"];
        if (!string.IsNullOrEmpty(apiKey))
        {
            _sendGridClient = new SendGridClient(apiKey);
        }
        else
        {
            _logger.LogWarning("SendGrid API key not configured. Emails will be logged only.");
            _sendGridClient = null!;
        }
    }

    public async Task SendVerificationEmailAsync(string toEmail, string code)
    {
        var subject = "Verify Your Email - KanKan";
        var htmlContent = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #07c160;'>Welcome to KanKan!</h2>
                    <p>Thank you for registering. Please use the following code to verify your email address:</p>
                    <div style='background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;'>
                        {code}
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                    <hr style='border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;'>
                    <p style='color: #666; font-size: 12px;'>This is an automated email. Please do not reply.</p>
                </div>
            </body>
            </html>";

        await SendEmailAsync(toEmail, subject, htmlContent);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string code)
    {
        var subject = "Reset Your Password - KanKan";
        var htmlContent = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #07c160;'>Password Reset Request</h2>
                    <p>We received a request to reset your password. Please use the following code:</p>
                    <div style='background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;'>
                        {code}
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
                    <hr style='border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;'>
                    <p style='color: #666; font-size: 12px;'>This is an automated email. Please do not reply.</p>
                </div>
            </body>
            </html>";

        await SendEmailAsync(toEmail, subject, htmlContent);
    }

    public async Task SendWelcomeEmailAsync(string toEmail, string displayName)
    {
        var subject = "Welcome to KanKan!";
        var htmlContent = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #07c160;'>Welcome, {displayName}!</h2>
                    <p>Your account has been successfully created.</p>
                    <p>You can now start chatting with your friends and family.</p>
                    <h3>Getting Started:</h3>
                    <ul>
                        <li>Update your profile with a photo</li>
                        <li>Add friends by searching their email</li>
                        <li>Start a conversation</li>
                        <li>Share moments with your contacts</li>
                    </ul>
                    <p>If you have any questions, feel free to reach out to our support team.</p>
                    <p style='margin-top: 30px;'>Happy chatting!</p>
                    <hr style='border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;'>
                    <p style='color: #666; font-size: 12px;'>This is an automated email. Please do not reply.</p>
                </div>
            </body>
            </html>";

        await SendEmailAsync(toEmail, subject, htmlContent);
    }

    private async Task SendEmailAsync(string toEmail, string subject, string htmlContent)
    {
        try
        {
            if (_sendGridClient == null)
            {
                _logger.LogWarning($"Email not sent (SendGrid not configured): To={toEmail}, Subject={subject}");
                _logger.LogInformation($"Email content: {htmlContent}");
                return;
            }

            var from = new EmailAddress(
                _configuration["Email:FromEmail"] ?? "noreply@kankan.local",
                _configuration["Email:FromName"] ?? "KanKan"
            );
            var to = new EmailAddress(toEmail);
            var msg = MailHelper.CreateSingleEmail(from, to, subject, null, htmlContent);
            var response = await _sendGridClient.SendEmailAsync(msg);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation($"Email sent successfully to {toEmail}");
            }
            else
            {
                _logger.LogError($"Failed to send email to {toEmail}. Status: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error sending email to {toEmail}");
        }
    }
}
