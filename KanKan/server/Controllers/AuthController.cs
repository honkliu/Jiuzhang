using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using WeChat.API.Models.DTOs.Auth;
using WeChat.API.Models.DTOs.User;
using WeChat.API.Services.Interfaces;
using UserEntity = WeChat.API.Models.Entities.User;

namespace WeChat.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        IEmailService emailService,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _emailService = emailService;
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(request.Email))
                return BadRequest(new { message = "Invalid email format" });

            // Check if email already exists
            var existingUser = await _authService.GetUserByEmailAsync(request.Email);
            if (existingUser != null)
                return BadRequest(new { message = "Email already registered" });

            // Generate verification code
            var verificationCode = GenerateVerificationCode();

            // Store verification code in database
            await _authService.CreateVerificationCodeAsync(
                request.Email,
                verificationCode,
                "registration"
            );

            // Send verification email
            await _emailService.SendVerificationEmailAsync(
                request.Email,
                verificationCode
            );

            return Ok(new
            {
                message = "Verification code sent to your email",
                email = request.Email
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration failed");
            return StatusCode(500, new { message = "Registration failed" });
        }
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
    {
        try
        {
            // Verify the code
            var isValid = await _authService.VerifyCodeAsync(
                request.Email,
                request.Code
            );

            if (!isValid)
                return BadRequest(new { message = "Invalid or expired verification code" });

            // Create user account
            var user = await _authService.CreateUserAsync(new CreateUserDto
            {
                Email = request.Email,
                Password = request.Password,
                DisplayName = request.DisplayName
            });

            // Generate tokens
            var accessToken = _authService.GenerateAccessToken(user);
            var refreshToken = await _authService.GenerateRefreshTokenAsync(
                user.Id,
                GetIpAddress()
            );

            // Set refresh token in HTTP-only cookie
            SetRefreshTokenCookie(refreshToken);

            // Send welcome email
            await _emailService.SendWelcomeEmailAsync(user.Email, user.DisplayName);

            return Ok(new AuthResponse
            {
                AccessToken = accessToken,
                User = MapToUserDto(user)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Email verification failed");
            return StatusCode(500, new { message = "Verification failed" });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            // Validate credentials
            var user = await _authService.ValidateCredentialsAsync(
                request.Email,
                request.Password
            );

            if (user == null)
                return Unauthorized(new { message = "Invalid email or password" });

            // Check if email is verified
            if (!user.EmailVerified)
                return BadRequest(new { message = "Please verify your email first" });

            // Generate tokens
            var accessToken = _authService.GenerateAccessToken(user);
            var refreshToken = await _authService.GenerateRefreshTokenAsync(
                user.Id,
                GetIpAddress()
            );

            // Set refresh token in HTTP-only cookie
            SetRefreshTokenCookie(refreshToken);

            // Update last seen
            await _authService.UpdateLastSeenAsync(user.Id, true);

            return Ok(new AuthResponse
            {
                AccessToken = accessToken,
                User = MapToUserDto(user)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login failed");
            return StatusCode(500, new { message = "Login failed" });
        }
    }

    [HttpPost("refresh-token")]
    public async Task<IActionResult> RefreshToken()
    {
        try
        {
            var refreshToken = Request.Cookies["refreshToken"];

            if (string.IsNullOrEmpty(refreshToken))
                return Unauthorized(new { message = "No refresh token provided" });

            // Validate and get new tokens
            var result = await _authService.RefreshTokenAsync(
                refreshToken,
                GetIpAddress()
            );

            if (result == null)
                return Unauthorized(new { message = "Invalid refresh token" });

            // Set new refresh token in cookie
            SetRefreshTokenCookie(result.RefreshToken);

            return Ok(new { accessToken = result.AccessToken });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed");
            return Unauthorized(new { message = "Token refresh failed" });
        }
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var refreshToken = Request.Cookies["refreshToken"];

            if (!string.IsNullOrEmpty(refreshToken))
            {
                await _authService.RevokeRefreshTokenAsync(refreshToken);
            }

            // Update online status
            if (!string.IsNullOrEmpty(userId))
            {
                await _authService.UpdateLastSeenAsync(userId, false);
            }

            // Clear cookie
            Response.Cookies.Delete("refreshToken");

            return Ok(new { message = "Logged out successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Logout failed");
            return StatusCode(500, new { message = "Logout failed" });
        }
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        try
        {
            var user = await _authService.GetUserByEmailAsync(request.Email);

            // Don't reveal if email exists or not (security best practice)
            if (user == null)
                return Ok(new { message = "If email exists, reset code has been sent" });

            // Generate reset code
            var resetCode = GenerateVerificationCode();

            await _authService.CreateVerificationCodeAsync(
                request.Email,
                resetCode,
                "password_reset"
            );

            await _emailService.SendPasswordResetEmailAsync(
                request.Email,
                resetCode
            );

            return Ok(new { message = "If email exists, reset code has been sent" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Forgot password failed");
            return StatusCode(500, new { message = "Request failed" });
        }
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        try
        {
            var isValid = await _authService.VerifyCodeAsync(
                request.Email,
                request.Code
            );

            if (!isValid)
                return BadRequest(new { message = "Invalid or expired reset code" });

            await _authService.ResetPasswordAsync(request.Email, request.NewPassword);

            return Ok(new { message = "Password reset successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password reset failed");
            return StatusCode(500, new { message = "Reset failed" });
        }
    }

    // Helper methods
    private string GenerateVerificationCode()
    {
        return "123456";
    }

    private bool IsValidEmail(string email)
    {
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return addr.Address == email;
        }
        catch
        {
            return false;
        }
    }

    private string GetIpAddress()
    {
        if (Request.Headers.ContainsKey("X-Forwarded-For"))
            return Request.Headers["X-Forwarded-For"].ToString();
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private void SetRefreshTokenCookie(string token)
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = Request.IsHttps ? SameSiteMode.Strict : SameSiteMode.Lax,
            Expires = DateTime.UtcNow.AddDays(7)
        };
        Response.Cookies.Append("refreshToken", token, cookieOptions);
    }

    private UserDto MapToUserDto(UserEntity user)
    {
        return new UserDto
        {
            Id = user.Id,
            Email = user.Email,
            WeChatId = user.WeChatId,
            DisplayName = user.DisplayName,
            AvatarUrl = user.AvatarUrl,
            Bio = user.Bio,
            IsOnline = user.IsOnline,
            LastSeen = user.LastSeen
        };
    }
}
