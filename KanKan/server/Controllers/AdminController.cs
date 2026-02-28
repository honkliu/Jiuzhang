using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.User;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly IUserRepository _userRepository;
    private readonly IContactRepository _contactRepository;
    private readonly IChatRepository _chatRepository;
    private readonly IChatUserRepository _chatUserRepository;
    private readonly IMessageRepository _messageRepository;
    private readonly IMomentRepository _momentRepository;
    private readonly IAvatarService _avatarService;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        IUserRepository userRepository,
        IContactRepository contactRepository,
        IChatRepository chatRepository,
        IChatUserRepository chatUserRepository,
        IMessageRepository messageRepository,
        IMomentRepository momentRepository,
        IAvatarService avatarService,
        ILogger<AdminController> logger)
    {
        _userRepository = userRepository;
        _contactRepository = contactRepository;
        _chatRepository = chatRepository;
        _chatUserRepository = chatUserRepository;
        _messageRepository = messageRepository;
        _momentRepository = momentRepository;
        _avatarService = avatarService;
        _logger = logger;
    }

    [HttpDelete("users/{userId}")]
    public async Task<IActionResult> DeleteUser(string userId)
    {
        try
        {
            var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
            var currentUser = await _userRepository.GetByIdAsync(currentUserId);
            if (currentUser == null)
                return Unauthorized();

            var scope = GetAdminScope(currentUser);
            if (!scope.IsAllowed)
                return Forbid();

            if (string.Equals(currentUserId, userId, StringComparison.Ordinal))
                return BadRequest(new { message = "Cannot delete yourself" });

            var target = await _userRepository.GetByIdAsync(userId);
            if (target == null)
                return NotFound(new { message = "User not found" });

            if (!IsTargetInScope(scope, target))
                return Forbid();

            await _contactRepository.DeleteAllForUserAsync(userId);
            await _momentRepository.DeleteByUserAsync(userId);
            await _messageRepository.DeleteBySenderAsync(userId);

            var chatUsers = await _chatUserRepository.GetUserChatsAsync(userId, includeHidden: true);
            var processedChatIds = new HashSet<string>(StringComparer.Ordinal);

            foreach (var chatUser in chatUsers)
            {
                var chatId = chatUser.ChatId;
                if (!processedChatIds.Add(chatId))
                    continue;

                var chat = await _chatRepository.GetByIdAsync(chatId);
                if (chat == null)
                    continue;

                if (string.Equals(chat.ChatType, "direct", StringComparison.OrdinalIgnoreCase))
                {
                    await _messageRepository.DeleteByChatAsync(chat.Id);
                    await _chatRepository.DeleteAsync(chat.Id);
                    await DeleteChatUsersAsync(chat);
                    continue;
                }

                var previousParticipants = chat.Participants.ToList();
                chat.Participants.RemoveAll(p => p.UserId == userId);
                chat.AdminIds.Remove(userId);

                if (chat.Participants.Count == 0)
                {
                    await _messageRepository.DeleteByChatAsync(chat.Id);
                    await _chatRepository.DeleteAsync(chat.Id);
                    await DeleteChatUsersAsync(new Chat { Id = chat.Id, Participants = previousParticipants });
                    continue;
                }

                chat.UpdatedAt = DateTime.UtcNow;
                await _chatRepository.UpdateAsync(chat);
                await UpsertChatUsersFromChatAsync(chat);
                await _chatUserRepository.DeleteAsync(userId, chat.Id);
            }

            await _chatUserRepository.DeleteAllForUserAsync(userId);
            await _userRepository.DeleteAsync(userId);

            return Ok(new { message = "User deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete user {UserId}", userId);
            return StatusCode(500, new { message = "Failed to delete user" });
        }
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] int limit = 200)
    {
        try
        {
            var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
            var currentUser = await _userRepository.GetByIdAsync(currentUserId);
            if (currentUser == null)
                return Unauthorized();

            var scope = GetAdminScope(currentUser);
            if (!scope.IsAllowed)
                return Forbid();

            var safeLimit = Math.Clamp(limit, 1, 500);
            List<User> users;

            if (scope.IsGlobal)
            {
                users = await _userRepository.GetAllUsersAsync(currentUser.Id, safeLimit);
            }
            else
            {
                users = await _userRepository.GetUsersByDomainAsync(scope.Domain, currentUser.Id, safeLimit);
            }

            var allowed = users
                .Where(u => IsTargetInScope(scope, u))
                .ToList();

            var userDtos = await Task.WhenAll(allowed.Select(u => ToAdminUserDtoNormalizedAsync(u)));

            return Ok(userDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list users");
            return StatusCode(500, new { message = "Failed to list users" });
        }
    }

    [HttpPost("users/{userId}/disable")]
    public async Task<IActionResult> DisableUser(string userId)
    {
        return await SetUserDisabledState(userId, true);
    }

    [HttpPost("users/{userId}/enable")]
    public async Task<IActionResult> EnableUser(string userId)
    {
        return await SetUserDisabledState(userId, false);
    }

    private static string ResolveDomain(User user)
    {
        return string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
    }

    private async Task<UserDto> ToAdminUserDtoNormalizedAsync(User user)
    {
        var normalizedAvatarImageId = await _avatarService.NormalizeAvatarImageIdAsync(user.AvatarImageId);
        return new UserDto
        {
            Id = user.Id,
            Domain = ResolveDomain(user),
            IsAdmin = user.IsAdmin,
            IsDisabled = user.IsDisabled,
            Handle = user.Handle,
            DisplayName = user.DisplayName,
            AvatarUrl = user.AvatarUrl,
            AvatarImageId = normalizedAvatarImageId,
            Gender = user.Gender,
            Bio = user.Bio,
            IsOnline = user.IsOnline,
            LastSeen = user.LastSeen
        };
    }

    private static AdminScope GetAdminScope(User user)
    {
        if (!user.IsAdmin)
            return AdminScope.None;

        var domain = ResolveDomain(user);
        if (DomainRules.IsSuperDomain(domain))
            return AdminScope.Global;

        return new AdminScope(true, false, domain);
    }

    private static bool IsTargetInScope(AdminScope scope, User target)
    {
        if (!scope.IsAllowed)
            return false;

        if (scope.IsGlobal)
            return true;

        var targetDomain = ResolveDomain(target);
        return string.Equals(targetDomain, scope.Domain, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<IActionResult> SetUserDisabledState(string userId, bool isDisabled)
    {
        try
        {
            var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
            var currentUser = await _userRepository.GetByIdAsync(currentUserId);
            if (currentUser == null)
                return Unauthorized();

            var scope = GetAdminScope(currentUser);
            if (!scope.IsAllowed)
                return Forbid();

            if (string.Equals(currentUserId, userId, StringComparison.Ordinal))
                return BadRequest(new { message = "Cannot change your own status" });

            var target = await _userRepository.GetByIdAsync(userId);
            if (target == null)
                return NotFound(new { message = "User not found" });

            if (!IsTargetInScope(scope, target))
                return Forbid();

            if (target.IsDisabled == isDisabled)
                return Ok(new { message = "No change" });

            target.IsDisabled = isDisabled;
            await _userRepository.UpdateAsync(target);

            return Ok(new { message = isDisabled ? "User disabled" : "User enabled" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update user {UserId} disabled state", userId);
            return StatusCode(500, new { message = "Failed to update user" });
        }
    }

    private readonly record struct AdminScope(bool IsAllowed, bool IsGlobal, string Domain)
    {
        public static AdminScope None => new(false, false, string.Empty);
        public static AdminScope Global => new(true, true, string.Empty);
    }

    private static ChatUser BuildChatUser(Chat chat, ChatParticipant participant)
    {
        return new ChatUser
        {
            Id = chat.Id,
            ChatId = chat.Id,
            UserId = participant.UserId,
            Domain = chat.Domain,
            ChatType = chat.ChatType,
            Participants = chat.Participants ?? new List<ChatParticipant>(),
            GroupName = chat.GroupName,
            GroupAvatar = chat.GroupAvatar,
            AdminIds = chat.AdminIds ?? new List<string>(),
            LastMessage = chat.LastMessage,
            IsHidden = participant.IsHidden,
            ClearedAt = participant.ClearedAt,
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        };
    }

    private async Task UpsertChatUsersFromChatAsync(Chat chat)
    {
        var chatUsers = chat.Participants
            .Where(p => !string.IsNullOrWhiteSpace(p.UserId))
            .Select(p => BuildChatUser(chat, p))
            .ToList();

        await _chatUserRepository.UpsertManyAsync(chatUsers);
    }

    private async Task DeleteChatUsersAsync(Chat chat)
    {
        var tasks = chat.Participants
            .Where(p => !string.IsNullOrWhiteSpace(p.UserId))
            .Select(p => _chatUserRepository.DeleteAsync(p.UserId, chat.Id));

        await Task.WhenAll(tasks);
    }
}
