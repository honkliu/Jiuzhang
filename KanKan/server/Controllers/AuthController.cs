using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using KanKan.API.Domain;
using KanKan.API.Hubs;
using KanKan.API.Models.DTOs.Auth;
using KanKan.API.Models.DTOs.Notification;
using KanKan.API.Models.DTOs.User;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;
using KanKan.API.Services;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IEmailService _emailService;
    private readonly IAvatarService _avatarService;
    private readonly INotificationRepository _notificationRepository;
    private readonly IUserRepository _userRepository;
    private readonly IFamilyTreeVisibilityRepository _familyTreeVisibilityRepository;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        IEmailService emailService,
        IAvatarService avatarService,
        INotificationRepository notificationRepository,
        IUserRepository userRepository,
        IFamilyTreeVisibilityRepository familyTreeVisibilityRepository,
        IHubContext<ChatHub> hubContext,
        IConfiguration configuration,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _emailService = emailService;
        _avatarService = avatarService;
        _notificationRepository = notificationRepository;
        _userRepository = userRepository;
        _familyTreeVisibilityRepository = familyTreeVisibilityRepository;
        _hubContext = hubContext;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(request.Email))
                return BadRequest(new { message = "Invalid account format" });

            // Check if email already exists
            var existingUser = await _authService.GetUserByEmailAsync(request.Email);
            if (existingUser != null)
                return BadRequest(new { message = "Email already registered" });

            var emailLower = request.Email.Trim().ToLower();
            var existingCode = await _authService.GetActiveVerificationCodeAsync(emailLower, "registration");
            if (string.IsNullOrEmpty(existingCode))
            {
                var code = GenerateVerificationCode();
                await _authService.CreateVerificationCodeAsync(emailLower, code, "registration", 5256000);
                await NotifyAdminsAboutPendingActionAsync(emailLower, "registration", "requested to register", "reg");
            }

            return Ok(new
            {
                message = "Verification step ready",
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
            var isValid = await _authService.VerifyCodeAsync(
                request.Email,
                request.Code?.Trim() ?? "",
                "registration");

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
                User = await MapToUserDtoAsync(user)
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

            if (user.IsDisabled)
                return BadRequest(new { message = "Account disabled" });

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
                User = await MapToUserDtoAsync(user)
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
            var normalizedEmail = request.Email.Trim().ToLower();
            var user = await _authService.GetUserByEmailAsync(normalizedEmail);

            // Don't reveal if email exists or not.
            if (user == null)
                return Ok(new { message = "Verification step ready", email = request.Email });

            var existingCode = await _authService.GetActiveVerificationCodeAsync(normalizedEmail, "password_reset");
            if (string.IsNullOrEmpty(existingCode))
            {
                var resetCode = GenerateVerificationCode();

                await _authService.CreateVerificationCodeAsync(
                    normalizedEmail,
                    resetCode,
                    "password_reset",
                    5256000
                );

                await NotifyAdminsAboutPendingActionAsync(normalizedEmail, "password_reset", "requested password reset", "pwdreset");
            }

            return Ok(new { message = "Verification step ready", email = request.Email });
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
            var normalizedEmail = request.Email.Trim().ToLower();

            var isValid = await _authService.VerifyCodeAsync(
                normalizedEmail,
                request.Code?.Trim() ?? "",
                "password_reset"
            );

            if (!isValid)
                return BadRequest(new { message = "Invalid or expired reset code" });

            await _authService.ResetPasswordAsync(normalizedEmail, request.NewPassword);

            return Ok(new { message = "Password reset successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password reset failed");
            return StatusCode(500, new { message = "Reset failed" });
        }
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? string.Empty;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized(new { message = "Unauthorized" });

            var currentUser = await _userRepository.GetByIdAsync(userId);
            if (currentUser == null)
                return Unauthorized(new { message = "Unauthorized" });

            var validUser = await _authService.ValidateCredentialsAsync(currentUser.Email, request.CurrentPassword);
            if (validUser == null)
                return BadRequest(new { message = "Current password is incorrect" });

            if (string.Equals(request.CurrentPassword, request.NewPassword, StringComparison.Ordinal))
                return BadRequest(new { message = "New password must be different" });

            await _authService.ResetPasswordAsync(currentUser.Email, request.NewPassword);
            return Ok(new { message = "Password changed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Change password failed");
            return StatusCode(500, new { message = "Change password failed" });
        }
    }

    // Helper methods
    private string GenerateVerificationCode()
    {
        return Random.Shared.Next(1000, 10000).ToString();
    }

    private async Task NotifyAdminsAboutPendingActionAsync(string email, string category, string body, string notificationPrefix)
    {
        var adminEmails = _configuration.GetSection("AdminEmails").Get<string[]>() ?? Array.Empty<string>();

        foreach (var adminEmail in adminEmails)
        {
            var admin = await _authService.GetUserByEmailAsync(adminEmail);
            if (admin == null) continue;
            if (!CanAdminAccessEmail(admin, email)) continue;

            var notification = new Notification
            {
                Id = $"notif_{notificationPrefix}_{admin.Id}_{email}_{DateTime.UtcNow.Ticks}",
                UserId = admin.Id,
                Category = category,
                EntityId = email,
                Title = email,
                Body = body,
                IsRead = false,
                CreatedAt = DateTime.UtcNow,
                Ttl = 60 * 60 * 24 * 30
            };

            await _notificationRepository.CreateAsync(notification);
            await _hubContext.Clients.User(admin.Id).SendAsync("NotificationCreated", new NotificationDto
            {
                Id = notification.Id,
                Category = notification.Category,
                Title = notification.Title,
                Body = notification.Body,
                IsRead = false,
                CreatedAt = notification.CreatedAt
            });
        }
    }

    private bool IsValidEmail(string email)
    {
        return DomainRules.IsValidAccount(email);
    }

    private static bool CanAdminAccessEmail(UserEntity admin, string targetEmail)
    {
        var scope = GetAdminScope(admin);
        if (!scope.IsAllowed)
            return false;

        if (scope.IsGlobal)
            return true;

        var targetDomain = DomainRules.GetDomain(targetEmail);
        return DomainRules.CanAccess(scope.Domain, targetDomain);
    }

    private static AdminScope GetAdminScope(UserEntity user)
    {
        if (!user.IsAdmin)
            return AdminScope.None;

        var domain = ResolveDomain(user);
        if (DomainRules.IsSuperDomain(domain))
            return AdminScope.Global;

        return new AdminScope(true, false, domain);
    }

    private static string ResolveDomain(UserEntity user)
    {
        return string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
    }

    private string GetIpAddress()
    {
        if (Request.Headers.ContainsKey("X-Forwarded-For"))
            return Request.Headers["X-Forwarded-For"].ToString();
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private void SetRefreshTokenCookie(string token)
    {
        var refreshTokenExpirationDays = int.TryParse(
            _configuration["Jwt:RefreshTokenExpirationDays"],
            out var configuredDays
        ) ? configuredDays : 7;

        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = Request.IsHttps ? SameSiteMode.Strict : SameSiteMode.Lax,
            Expires = DateTime.UtcNow.AddDays(refreshTokenExpirationDays)
        };
        Response.Cookies.Append("refreshToken", token, cookieOptions);
    }

    private async Task<UserDto> MapToUserDtoAsync(UserEntity user)
    {
        var normalizedAvatarImageId = await _avatarService.NormalizeAvatarImageIdAsync(user.AvatarImageId);
        var familyCapabilities = await GetFamilyCapabilitiesAsync(user);
        var editableFamilyTreeDomains = FamilyAccessPolicy.GetEditableDomains(_configuration, user).ToArray();
        return new UserDto
        {
            Id = user.Id,
            Domain = string.IsNullOrWhiteSpace(user.Domain) ? DomainRules.GetDomain(user.Email) : user.Domain,
            EditableFamilyTreeDomains = editableFamilyTreeDomains.ToList(),
            Handle = user.Handle,
            IsAdmin = user.IsAdmin,
            CanViewFamilyTree = familyCapabilities.canView,
            CanEditFamilyTree = familyCapabilities.canEdit,
            IsDisabled = user.IsDisabled,
            DisplayName = user.DisplayName,
            AvatarUrl = user.AvatarUrl,
            AvatarImageId = normalizedAvatarImageId,
            Gender = user.Gender,
            Bio = user.Bio,
            IsOnline = user.IsOnline,
            LastSeen = user.LastSeen
        };
    }

    private async Task<(bool canView, bool canEdit)> GetFamilyCapabilitiesAsync(UserEntity user)
    {
        var canView = FamilyAccessPolicy.CanViewFamilyTree(_configuration, user);
        var canEdit = FamilyAccessPolicy.CanEditAnyFamilyTree(_configuration, user);
        if (canView && canEdit)
        {
            return (canView, canEdit);
        }

        var visibilities = new List<FamilyTreeVisibility>();
        visibilities.AddRange(await _familyTreeVisibilityRepository.GetByEmailAsync(FamilyAccessPolicy.NormalizeEmail(user.Email)));

        var domain = FamilyAccessPolicy.ResolveDomain(user);
        if (!string.IsNullOrWhiteSpace(domain))
        {
            visibilities.AddRange(await _familyTreeVisibilityRepository.GetByDomainAsync(domain));
        }

        if (!canView)
        {
            canView = FamilyAccessPolicy.HasAnyTreeVisibility(user, visibilities);
        }

        if (!canEdit)
        {
            canEdit = FamilyAccessPolicy.HasAnyTreeEditAccess(user, visibilities);
        }

        return (canView, canEdit);
    }

    private readonly record struct AdminScope(bool IsAllowed, bool IsGlobal, string Domain)
    {
        public static AdminScope None => new(false, false, string.Empty);
        public static AdminScope Global => new(true, true, string.Empty);
    }
}
