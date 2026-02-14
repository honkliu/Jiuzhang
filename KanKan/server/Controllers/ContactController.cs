using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using KanKan.API.Domain;
using KanKan.API.Domain.Chat;
using KanKan.API.Models.DTOs.User;
using KanKan.API.Models.Entities;
using KanKan.API.Hubs;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ContactController : ControllerBase
{
    private readonly IUserRepository _userRepository;
    private readonly IContactRepository _contactRepository;
    private readonly IChatRepository _chatRepository;
    private readonly IChatUserRepository _chatUserRepository;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly ILogger<ContactController> _logger;

    public ContactController(
        IUserRepository userRepository,
        IContactRepository contactRepository,
        IChatRepository chatRepository,
        IChatUserRepository chatUserRepository,
        IHubContext<ChatHub> hubContext,
        ILogger<ContactController> logger)
    {
        _userRepository = userRepository;
        _contactRepository = contactRepository;
        _chatRepository = chatRepository;
        _chatUserRepository = chatUserRepository;
        _hubContext = hubContext;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";

    private async Task<User?> GetCurrentUserAsync()
    {
        var userId = GetUserId();
        if (string.IsNullOrWhiteSpace(userId))
            return null;
        return await _userRepository.GetByIdAsync(userId);
    }

    private static string ResolveDomain(User user)
    {
        return string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
    }

    private static bool IsDomainAllowed(User viewer, User target)
    {
        if (ChatDomain.IsAgentUserId(target.Id))
            return true;

        return DomainRules.CanAccess(ResolveDomain(viewer), ResolveDomain(target));
    }

    private static UserDto ToUserDto(User user, bool includeDomain) => new()
    {
        Id = user.Id,
        Domain = includeDomain
            ? (string.IsNullOrWhiteSpace(user.Domain) ? DomainRules.GetDomain(user.Email) : user.Domain)
            : null,
        IsAdmin = user.IsAdmin,
        IsDisabled = user.IsDisabled,
        Handle = user.Handle,
        DisplayName = user.DisplayName,
        AvatarUrl = user.AvatarUrl,
        Gender = user.Gender,
        Bio = user.Bio,
        IsOnline = user.IsOnline,
        LastSeen = user.LastSeen
    };

    /// <summary>
    /// Search for users by display name or handle
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<UserDto>>> SearchUsers([FromQuery] string q)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return BadRequest(new { message = "Search query must be at least 2 characters" });

            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var users = await _userRepository.SearchUsersAsync(q, currentUser.Id);
            var includeDomain = DomainRules.IsSuperDomain(ResolveDomain(currentUser));
            var userDtos = users
                .Where(u => IsDomainAllowed(currentUser, u))
                .Select(u => ToUserDto(u, includeDomain))
                .ToList();

            return Ok(userDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search users");
            return StatusCode(500, new { message = "Failed to search users" });
        }
    }

    /// <summary>
    /// Get user by ID
    /// </summary>
    [HttpGet("{userId}")]
    public async Task<ActionResult<UserDto>> GetUser(string userId)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var user = await _userRepository.GetByIdAsync(userId);

            if (user == null)
                return NotFound(new { message = "User not found" });

            if (!IsDomainAllowed(currentUser, user))
                return Forbid();

            var includeDomain = DomainRules.IsSuperDomain(ResolveDomain(currentUser));
            return Ok(ToUserDto(user, includeDomain));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get user {UserId}", userId);
            return StatusCode(500, new { message = "Failed to get user" });
        }
    }

    /// <summary>
    /// Get all users (for demo purposes - in production would be paginated/limited)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAllUsers()
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var users = await _userRepository.GetAllUsersAsync(currentUser.Id);
            var includeDomain = DomainRules.IsSuperDomain(ResolveDomain(currentUser));
            var userDtos = users
                .Where(u => IsDomainAllowed(currentUser, u))
                .Select(u => ToUserDto(u, includeDomain))
                .ToList();

            return Ok(userDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get users");
            return StatusCode(500, new { message = "Failed to get users" });
        }
    }

    /// <summary>
    /// Get accepted contacts for current user
    /// </summary>
    [HttpGet("contacts")]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetContacts()
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var contacts = await _contactRepository.GetContactsByStatusAsync(currentUser.Id, "accepted");
            var includeDomain = DomainRules.IsSuperDomain(ResolveDomain(currentUser));

            var users = new List<UserDto>();
            foreach (var contact in contacts)
            {
                var user = await _userRepository.GetByIdAsync(contact.ContactId);
                if (user != null && IsDomainAllowed(currentUser, user))
                {
                    users.Add(ToUserDto(user, includeDomain));
                }
            }

            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get contacts");
            return StatusCode(500, new { message = "Failed to get contacts" });
        }
    }

    /// <summary>
    /// Get incoming friend requests
    /// </summary>
    [HttpGet("requests")]
    public async Task<ActionResult<IEnumerable<FriendRequestDto>>> GetFriendRequests()
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var pending = await _contactRepository.GetContactsByStatusAsync(currentUser.Id, "pending");
            var includeDomain = DomainRules.IsSuperDomain(ResolveDomain(currentUser));

            var requests = new List<FriendRequestDto>();
            foreach (var contact in pending)
            {
                var fromUser = await _userRepository.GetByIdAsync(contact.ContactId);
                if (fromUser != null && IsDomainAllowed(currentUser, fromUser))
                {
                    requests.Add(new FriendRequestDto
                    {
                        Id = contact.Id,
                        FromUserId = fromUser.Id,
                        ToUserId = currentUser.Id,
                        Status = contact.Status,
                        CreatedAt = contact.AddedAt,
                        FromUser = ToUserDto(fromUser, includeDomain)
                    });
                }
            }

            return Ok(requests);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get friend requests");
            return StatusCode(500, new { message = "Failed to get friend requests" });
        }
    }

    /// <summary>
    /// Send a friend request
    /// </summary>
    [HttpPost("requests")]
    public async Task<IActionResult> SendFriendRequest([FromBody] SendFriendRequestRequest request)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            if (currentUser.Id == request.UserId)
                return BadRequest(new { message = "Cannot add yourself" });

            var target = await _userRepository.GetByIdAsync(request.UserId);
            if (target == null)
                return NotFound(new { message = "User not found" });

            if (!IsDomainAllowed(currentUser, target))
                return StatusCode(403, new { message = "Cross-domain contacts are not allowed" });

            var existing = await _contactRepository.GetByUserAndContactAsync(request.UserId, currentUser.Id);
            if (existing != null && existing.Status == "accepted")
                return Ok(new { message = "Already friends" });

            var pendingIncoming = existing ?? new Contact
            {
                Id = $"contact_{request.UserId}_{currentUser.Id}",
                UserId = request.UserId,
                ContactId = currentUser.Id,
                DisplayName = target.DisplayName,
                Domain = ResolveDomain(target),
                Status = "pending",
                AddedAt = DateTime.UtcNow,
                LastInteraction = DateTime.UtcNow,
                Type = "contact"
            };

            pendingIncoming.Status = "pending";
            pendingIncoming.AddedAt = DateTime.UtcNow;
            await _contactRepository.UpsertAsync(pendingIncoming);

            // Optional outgoing record for sender
            var outgoing = await _contactRepository.GetByUserAndContactAsync(currentUser.Id, request.UserId) ?? new Contact
            {
                Id = $"contact_{currentUser.Id}_{request.UserId}",
                UserId = currentUser.Id,
                ContactId = request.UserId,
                DisplayName = target.DisplayName,
                Domain = ResolveDomain(currentUser),
                Status = "pending_outgoing",
                AddedAt = DateTime.UtcNow,
                LastInteraction = DateTime.UtcNow,
                Type = "contact"
            };
            outgoing.Status = "pending_outgoing";
            outgoing.AddedAt = DateTime.UtcNow;
            await _contactRepository.UpsertAsync(outgoing);

            return Ok(new { message = "Friend request sent" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send friend request");
            return StatusCode(500, new { message = "Failed to send friend request" });
        }
    }

    /// <summary>
    /// Accept a friend request
    /// </summary>
    [HttpPost("requests/{fromUserId}/accept")]
    public async Task<IActionResult> AcceptFriendRequest(string fromUserId)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser == null)
                return Unauthorized();

            var request = await _contactRepository.GetByUserAndContactAsync(currentUser.Id, fromUserId);

            if (request == null || request.Status != "pending")
                return NotFound(new { message = "Friend request not found" });

            request.Status = "accepted";
            request.AddedAt = DateTime.UtcNow;
            await _contactRepository.UpsertAsync(request);

            var fromUser = await _userRepository.GetByIdAsync(fromUserId);
            if (fromUser != null)
            {
                if (!IsDomainAllowed(currentUser, fromUser))
                    return StatusCode(403, new { message = "Cross-domain contacts are not allowed" });

                var reverse = await _contactRepository.GetByUserAndContactAsync(fromUserId, currentUser.Id) ?? new Contact
                {
                    Id = $"contact_{fromUserId}_{currentUser.Id}",
                    UserId = fromUserId,
                    ContactId = currentUser.Id,
                    DisplayName = fromUser.DisplayName,
                    Domain = ResolveDomain(fromUser),
                    Status = "accepted",
                    AddedAt = DateTime.UtcNow,
                    LastInteraction = DateTime.UtcNow,
                    Type = "contact"
                };

                reverse.Status = "accepted";
                reverse.AddedAt = DateTime.UtcNow;
                await _contactRepository.UpsertAsync(reverse);
            }

            return Ok(new { message = "Friend request accepted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to accept friend request");
            return StatusCode(500, new { message = "Failed to accept friend request" });
        }
    }

    /// <summary>
    /// Reject a friend request
    /// </summary>
    [HttpPost("requests/{fromUserId}/reject")]
    public async Task<IActionResult> RejectFriendRequest(string fromUserId)
    {
        try
        {
            var userId = GetUserId();
            var request = await _contactRepository.GetByUserAndContactAsync(userId, fromUserId);

            if (request == null || request.Status != "pending")
                return NotFound(new { message = "Friend request not found" });

            await _contactRepository.DeleteAsync(request.Id, userId);
            return Ok(new { message = "Friend request rejected" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reject friend request");
            return StatusCode(500, new { message = "Failed to reject friend request" });
        }
    }

    /// <summary>
    /// Remove a friend relationship
    /// </summary>
    [HttpDelete("friends/{friendUserId}")]
    public async Task<IActionResult> RemoveFriend(string friendUserId)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(friendUserId))
                return BadRequest(new { message = "Friend user id is required" });

            var myContact = await _contactRepository.GetByUserAndContactAsync(userId, friendUserId);
            if (myContact != null)
            {
                await _contactRepository.DeleteAsync(myContact.Id, userId);
            }

            var theirContact = await _contactRepository.GetByUserAndContactAsync(friendUserId, userId);
            if (theirContact != null)
            {
                await _contactRepository.DeleteAsync(theirContact.Id, friendUserId);
            }

            return Ok(new { message = "Friend removed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove friend {FriendUserId}", friendUserId);
            return StatusCode(500, new { message = "Failed to remove friend" });
        }
    }

    /// <summary>
    /// Get current user's profile
    /// </summary>
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> GetCurrentUser()
    {
        try
        {
            var userId = GetUserId();
            var user = await _userRepository.GetByIdAsync(userId);

            if (user == null)
                return NotFound(new { message = "User not found" });

            return Ok(ToUserDto(user, includeDomain: false));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get current user");
            return StatusCode(500, new { message = "Failed to get user" });
        }
    }

    /// <summary>
    /// Update current user's profile
    /// </summary>
    [HttpPut("me")]
    public async Task<ActionResult<UserDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        try
        {
            var userId = GetUserId();
            var user = await _userRepository.GetByIdAsync(userId);

            if (user == null)
                return NotFound(new { message = "User not found" });

            if (!string.IsNullOrWhiteSpace(request.DisplayName))
                user.DisplayName = request.DisplayName;

            if (request.Bio != null)
                user.Bio = request.Bio.Trim();

            if (request.AvatarUrl != null)
                user.AvatarUrl = request.AvatarUrl.Trim();

            if (!string.IsNullOrWhiteSpace(request.Gender))
            {
                var g = request.Gender.Trim().ToLowerInvariant();
                if (g is not ("male" or "female"))
                    return BadRequest(new { message = "Gender must be 'male' or 'female'" });
                user.Gender = g;
            }

            user.UpdatedAt = DateTime.UtcNow;
            await _userRepository.UpdateAsync(user);

            // Persist profile changes into chat participant snapshots so future fetches are consistent,
            // even if the client missed the real-time SignalR event (e.g., user was on Profile page).
            try
            {
                var chatUsers = await _chatUserRepository.GetUserChatsAsync(user.Id, includeHidden: true);
                foreach (var chatUser in chatUsers)
                {
                    var idx = chatUser.Participants.FindIndex(p => p.UserId == user.Id);
                    if (idx >= 0)
                    {
                        await _chatRepository.PatchParticipantProfileAsync(
                            chatId: chatUser.ChatId,
                            participantIndex: idx,
                            displayName: user.DisplayName,
                            avatarUrl: user.AvatarUrl ?? string.Empty,
                            gender: user.Gender
                        );

                        await _chatUserRepository.PatchParticipantProfileAsync(
                            userId: user.Id,
                            chatId: chatUser.ChatId,
                            participantIndex: idx,
                            displayName: user.DisplayName,
                            avatarUrl: user.AvatarUrl ?? string.Empty,
                            gender: user.Gender
                        );
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update chat participant snapshots for {UserId}", user.Id);
            }

            // Notify all connected clients so they can update chat list avatars/names immediately.
            await _hubContext.Clients.All.SendAsync("UserUpdated", new
            {
                userId = user.Id,
                displayName = user.DisplayName,
                avatarUrl = user.AvatarUrl,
                gender = user.Gender
            });

            return Ok(ToUserDto(user, includeDomain: false));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update profile");
            return StatusCode(500, new { message = "Failed to update profile" });
        }
    }
}

public class UpdateProfileRequest
{
    public string? DisplayName { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Gender { get; set; }
}

public class SendFriendRequestRequest
{
    public string UserId { get; set; } = string.Empty;
}

public class FriendRequestDto
{
    public string Id { get; set; } = string.Empty;
    public string FromUserId { get; set; } = string.Empty;
    public string ToUserId { get; set; } = string.Empty;
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; }
    public UserDto FromUser { get; set; } = new();
}
