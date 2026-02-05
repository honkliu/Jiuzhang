using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using KanKan.API.Hubs;
using KanKan.API.Models.DTOs.Chat;
using KanKan.API.Models.DTOs.Notification;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    private const string AgentUserId = "user_ai_wa";
    private const string AgentDisplayName = "Wa";

    private readonly IChatRepository _chatRepository;
    private readonly IMessageRepository _messageRepository;
    private readonly IUserRepository _userRepository;
    private readonly INotificationRepository _notificationRepository;
    private readonly IAgentService _agentService;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        IChatRepository chatRepository,
        IMessageRepository messageRepository,
        IUserRepository userRepository,
        INotificationRepository notificationRepository,
        IAgentService agentService,
        IHubContext<ChatHub> hubContext,
        ILogger<ChatController> logger)
    {
        _chatRepository = chatRepository;
        _messageRepository = messageRepository;
        _userRepository = userRepository;
        _notificationRepository = notificationRepository;
        _agentService = agentService;
        _hubContext = hubContext;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
    private string GetUserName() => User.FindFirst(ClaimTypes.Name)?.Value ?? "";

    /// <summary>
    /// Get all chats for the current user
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ChatDto>>> GetChats()
    {
        try
        {
            var userId = GetUserId();
            var chats = await _chatRepository.GetUserChatsAsync(userId);

            var chatDtos = chats.Select(c => MapToChatDto(c, userId)).ToList();
            return Ok(chatDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get chats");
            return StatusCode(500, new { message = "Failed to get chats" });
        }
    }

    /// <summary>
    /// Get a specific chat by ID
    /// </summary>
    [HttpGet("{chatId}")]
    public async Task<ActionResult<ChatDto>> GetChat(string chatId)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            // If the user explicitly opens a hidden chat, unhide it for them.
            var me = chat.Participants.FirstOrDefault(p => p.UserId == userId);
            if (me != null && me.IsHidden)
            {
                await _chatRepository.SetHiddenAsync(chatId, userId, isHidden: false);
                me.IsHidden = false;
            }

            return Ok(MapToChatDto(chat, userId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to get chat" });
        }
    }

    /// <summary>
    /// Create a new chat (direct or group)
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<ChatDto>> CreateChat([FromBody] CreateChatRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();
            var currentUser = await _userRepository.GetByIdAsync(userId);

            if (currentUser == null)
                return BadRequest(new { message = "User not found" });

            // For direct chats, check if one already exists
            if (request.ChatType == "direct" && request.ParticipantIds.Count == 1)
            {
                var otherUserId = request.ParticipantIds[0];
                var existingChat = await _chatRepository.GetDirectChatAsync(userId, otherUserId);

                if (existingChat != null)
                {
                    var me = existingChat.Participants.FirstOrDefault(p => p.UserId == userId);
                    if (me != null && me.IsHidden)
                    {
                        await _chatRepository.SetHiddenAsync(existingChat.Id, userId, isHidden: false);
                        me.IsHidden = false;
                    }
                    return Ok(MapToChatDto(existingChat, userId));
                }
            }

            // Get all participant users
            var participantIds = new List<string> { userId };
            participantIds.AddRange(request.ParticipantIds);

            var participants = new List<ChatParticipant>();
            foreach (var participantId in participantIds.Distinct())
            {
                var user = await _userRepository.GetByIdAsync(participantId);
                if (user == null && participantId == AgentUserId)
                {
                    user = await _userRepository.CreateAsync(new User
                    {
                        Id = AgentUserId,
                        Type = "user",
                        Email = "wa@assistant.local",
                        EmailVerified = true,
                        PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
                        Handle = "assistant_1003",
                        DisplayName = AgentDisplayName,
                        AvatarUrl = "https://i.pravatar.cc/150?img=3",
                        Bio = "AI assistant",
                        IsOnline = true,
                        LastSeen = DateTime.UtcNow,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                        Settings = new UserSettings
                        {
                            Privacy = "friends",
                            Notifications = true,
                            Language = "en",
                            Theme = "light"
                        },
                        RefreshTokens = new List<RefreshToken>()
                    });
                }
                if (user != null)
                {
                    participants.Add(new ChatParticipant
                    {
                        UserId = user.Id,
                        DisplayName = user.DisplayName,
                        AvatarUrl = user.AvatarUrl ?? "",
                        JoinedAt = DateTime.UtcNow
                    });
                }
            }

            if (participants.Count < 2)
                return BadRequest(new { message = "Chat must have at least 2 participants" });

            var chat = new Chat
            {
                Id = $"chat_{Guid.NewGuid()}",
                ChatType = request.ChatType ?? "direct",
                Participants = participants,
                GroupName = request.GroupName,
                GroupAvatar = request.GroupAvatar,
                AdminIds = request.ChatType == "group" ? new List<string> { userId } : new List<string>(),
                LastMessage = null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _chatRepository.CreateAsync(chat);

            // Notify all participants about the new chat via SignalR
            foreach (var participant in participants)
            {
                await _hubContext.Clients.User(participant.UserId)
                    .SendAsync("ChatCreated", MapToChatDto(chat, participant.UserId));
            }

            _logger.LogInformation("Chat {ChatId} created by user {UserId}", chat.Id, userId);

            return CreatedAtAction(nameof(GetChat), new { chatId = chat.Id }, MapToChatDto(chat, userId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create chat");
            return StatusCode(500, new { message = "Failed to create chat" });
        }
    }

    /// <summary>
    /// Update chat (group name, avatar)
    /// </summary>
    [HttpPut("{chatId}")]
    public async Task<ActionResult<ChatDto>> UpdateChat(string chatId, [FromBody] UpdateChatRequest request)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            // Only admins can update group chats
            if (chat.ChatType == "group" && !chat.AdminIds.Contains(userId))
                return Forbid();

            if (!string.IsNullOrEmpty(request.GroupName))
                chat.GroupName = request.GroupName;

            if (!string.IsNullOrEmpty(request.GroupAvatar))
                chat.GroupAvatar = request.GroupAvatar;

            chat.UpdatedAt = DateTime.UtcNow;
            await _chatRepository.UpdateAsync(chat);

            // Notify participants
            await _hubContext.Clients.Group(chatId).SendAsync("ChatUpdated", MapToChatDto(chat, userId));

            return Ok(MapToChatDto(chat, userId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to update chat" });
        }
    }

    /// <summary>
    /// Delete/leave a chat
    /// </summary>
    [HttpDelete("{chatId}")]
    public async Task<IActionResult> DeleteChat(string chatId)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            if (chat.ChatType == "direct")
            {
                // For direct chats, actually delete
                await _chatRepository.DeleteAsync(chatId);
            }
            else
            {
                // For group chats, just remove the user
                chat.Participants.RemoveAll(p => p.UserId == userId);
                chat.AdminIds.Remove(userId);

                if (chat.Participants.Count == 0)
                {
                    await _chatRepository.DeleteAsync(chatId);
                }
                else
                {
                    chat.UpdatedAt = DateTime.UtcNow;
                    await _chatRepository.UpdateAsync(chat);

                    // Notify remaining participants
                    await _hubContext.Clients.Group(chatId).SendAsync("ParticipantLeft", chatId, userId);
                }
            }

            return Ok(new { message = "Chat deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to delete chat" });
        }
    }

    /// <summary>
    /// Hide a chat for the current user (server-side).
    /// </summary>
    [HttpPost("{chatId}/hide")]
    public async Task<IActionResult> HideChat(string chatId)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            await _chatRepository.SetHiddenAsync(chatId, userId, isHidden: true);
            return Ok(new { message = "Chat hidden" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to hide chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to hide chat" });
        }
    }

    /// <summary>
    /// Unhide a chat for the current user (server-side).
    /// </summary>
    [HttpPost("{chatId}/unhide")]
    public async Task<IActionResult> UnhideChat(string chatId)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            await _chatRepository.SetHiddenAsync(chatId, userId, isHidden: false);
            return Ok(new { message = "Chat unhidden" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to unhide chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to unhide chat" });
        }
    }

    /// <summary>
    /// Get messages for a chat (paginated)
    /// </summary>
    [HttpGet("{chatId}/messages")]
    public async Task<ActionResult<IEnumerable<MessageDto>>> GetMessages(
        string chatId,
        [FromQuery] int limit = 50,
        [FromQuery] string? before = null)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            DateTime? beforeDate = null;
            if (!string.IsNullOrEmpty(before) && DateTime.TryParse(before, out var parsedDate))
            {
                beforeDate = parsedDate;
            }

            var messages = await _messageRepository.GetChatMessagesAsync(chatId, limit, beforeDate);

            var messageDtos = messages.Select(m => new MessageDto
            {
                Id = m.Id,
                ChatId = m.ChatId,
                SenderId = m.SenderId,
                SenderName = m.SenderName,
                SenderAvatar = m.SenderAvatar,
                MessageType = m.MessageType,
                Text = m.Content?.Text,
                MediaUrl = m.Content?.MediaUrl,
                ThumbnailUrl = m.Content?.ThumbnailUrl,
                Duration = m.Content?.Duration,
                FileName = m.Content?.FileName,
                FileSize = m.Content?.FileSize,
                ReplyTo = m.ReplyTo,
                Timestamp = m.Timestamp,
                DeliveredTo = m.DeliveredTo,
                ReadBy = m.ReadBy,
                Reactions = m.Reactions
            }).ToList();

            return Ok(messageDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get messages for chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to get messages" });
        }
    }

    /// <summary>
    /// Send a message (REST alternative to SignalR)
    /// </summary>
    [HttpPost("{chatId}/messages")]
    public async Task<ActionResult<MessageDto>> SendMessage(string chatId, [FromBody] SendMessageDto request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (!chat.Participants.Any(p => p.UserId == userId))
                return Forbid();

            request.ChatId = string.IsNullOrWhiteSpace(request.ChatId) ? chatId : request.ChatId;
            var user = await _userRepository.GetByIdAsync(userId);

            var message = new Message
            {
                Id = $"msg_{Guid.NewGuid()}",
                ChatId = request.ChatId,
                SenderId = userId,
                SenderName = userName,
                SenderAvatar = user?.AvatarUrl ?? "",
                MessageType = request.MessageType ?? "text",
                Content = new MessageContent
                {
                    Text = request.Text,
                    MediaUrl = request.MediaUrl,
                    ThumbnailUrl = request.ThumbnailUrl,
                    Duration = request.Duration,
                    FileName = request.FileName,
                    FileSize = request.FileSize
                },
                ReplyTo = request.ReplyTo,
                Timestamp = DateTime.UtcNow,
                DeliveredTo = new List<string>(),
                ReadBy = new List<string>(),
                Reactions = new Dictionary<string, string>(),
                IsDeleted = false
            };

            await _messageRepository.CreateAsync(message);

            // Update chat's last message
            chat.LastMessage = new ChatLastMessage
            {
                Text = request.Text ?? GetMessagePreviewText(request.MessageType),
                SenderId = userId,
                SenderName = userName,
                MessageType = request.MessageType ?? "text",
                Timestamp = DateTime.UtcNow
            };
            chat.UpdatedAt = DateTime.UtcNow;
            await _chatRepository.UpdateAsync(chat);

            // New activity should bring a hidden conversation back for recipients.
            var unhiddenRecipientIds = new List<string>();
            foreach (var participant in chat.Participants.Where(p => p.UserId != userId))
            {
                if (!participant.IsHidden)
                    continue;

                await _chatRepository.SetHiddenAsync(chat.Id, participant.UserId, isHidden: false);
                participant.IsHidden = false;
                unhiddenRecipientIds.Add(participant.UserId);

                await _hubContext.Clients.User(participant.UserId)
                    .SendAsync("ChatCreated", MapToChatDto(chat, participant.UserId));
            }

            var messageDto = new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                SenderId = message.SenderId,
                SenderName = message.SenderName,
                SenderAvatar = message.SenderAvatar,
                MessageType = message.MessageType,
                Text = message.Content.Text,
                MediaUrl = message.Content.MediaUrl,
                ThumbnailUrl = message.Content.ThumbnailUrl,
                Duration = message.Content.Duration,
                FileName = message.Content.FileName,
                FileSize = message.Content.FileSize,
                ReplyTo = message.ReplyTo,
                Timestamp = message.Timestamp,
                DeliveredTo = message.DeliveredTo,
                ReadBy = message.ReadBy,
                Reactions = message.Reactions
            };

            // Deliver message to all participants regardless of whether they are currently
            // joined to the chat's SignalR group (the client may leave non-active chats).
            var recipientIds = chat.Participants
                .Select(p => p.UserId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct()
                .ToList();
            await _hubContext.Clients.Users(recipientIds).SendAsync("ReceiveMessage", messageDto);

            // Add participants based on @mentions (e.g., @carol)
            await TryAddMentionedParticipantsAsync(chat, message, userId);

            // AI agent response if mentioned
            if (ShouldTriggerAgent(chat, message))
            {
                await EnsureAgentParticipantAsync(chat);
                var agentMessageId = $"msg_{Guid.NewGuid()}";
                var agentAvatar = (await _userRepository.GetByIdAsync(AgentUserId))?.AvatarUrl ?? string.Empty;

                await _hubContext.Clients.Group(chatId).SendAsync("AgentMessageStart", new
                {
                    id = agentMessageId,
                    chatId = chat.Id,
                    senderId = AgentUserId,
                    senderName = AgentDisplayName,
                    senderAvatar = agentAvatar,
                    messageType = "text",
                    text = "",
                    timestamp = DateTime.UtcNow,
                    deliveredTo = new List<string>(),
                    readBy = new List<string>(),
                    reactions = new Dictionary<string, string>(),
                    isDeleted = false
                });

                var fullText = new StringBuilder();
                var prompt = await BuildAgentPromptAsync(message);
                var history = await BuildHistoryAsync(chat.Id);

                try
                {
                    await foreach (var chunk in _agentService.StreamReplyAsync(chat.Id, prompt, history))
                    {
                        fullText.Append(chunk);
                        await _hubContext.Clients.Group(chatId).SendAsync("AgentMessageChunk", chat.Id, agentMessageId, chunk);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Agent streaming failed for chat {ChatId}", chat.Id);
                    fullText.Append("Sorry, I'm having trouble responding right now.");
                }

                var reply = fullText.ToString();
                if (!string.IsNullOrWhiteSpace(reply))
                {
                    var agentMessage = new Message
                    {
                        Id = agentMessageId,
                        ChatId = chat.Id,
                        SenderId = AgentUserId,
                        SenderName = AgentDisplayName,
                        SenderAvatar = agentAvatar,
                        MessageType = "text",
                        Content = new MessageContent { Text = reply },
                        Timestamp = DateTime.UtcNow,
                        DeliveredTo = new List<string>(),
                        ReadBy = new List<string>(),
                        Reactions = new Dictionary<string, string>(),
                        IsDeleted = false
                    };

                    await _messageRepository.CreateAsync(agentMessage);

                    chat.LastMessage = new ChatLastMessage
                    {
                        Text = reply,
                        SenderId = AgentUserId,
                        SenderName = AgentDisplayName,
                        MessageType = "text",
                        Timestamp = DateTime.UtcNow
                    };
                    chat.UpdatedAt = DateTime.UtcNow;
                    await _chatRepository.UpdateAsync(chat);

                    await _hubContext.Clients.Group(chatId).SendAsync("AgentMessageComplete", chat.Id, agentMessageId, reply);
                }
            }

            return CreatedAtAction(nameof(GetMessages), new { chatId }, messageDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message to chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to send message" });
        }
    }

    /// <summary>
    /// Delete a message
    /// </summary>
    [HttpDelete("{chatId}/messages/{messageId}")]
    public async Task<IActionResult> DeleteMessage(string chatId, string messageId)
    {
        try
        {
            var userId = GetUserId();
            var message = await _messageRepository.GetByIdAsync(messageId, chatId);

            if (message == null)
                return NotFound(new { message = "Message not found" });

            // Only sender can delete their message
            if (message.SenderId != userId)
                return Forbid();

            message.IsDeleted = true;
            message.DeletedAt = DateTime.UtcNow;
            message.Content = new MessageContent { Text = "This message was deleted" };
            await _messageRepository.UpdateAsync(message);

            // Notify via SignalR
            await _hubContext.Clients.Group(chatId).SendAsync("MessageDeleted", chatId, messageId);

            return Ok(new { message = "Message deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete message {MessageId}", messageId);
            return StatusCode(500, new { message = "Failed to delete message" });
        }
    }

    /// <summary>
    /// Add participants to a group chat
    /// </summary>
    [HttpPost("{chatId}/participants")]
    public async Task<IActionResult> AddParticipants(string chatId, [FromBody] AddParticipantsRequest request)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (chat.ChatType != "group")
                return BadRequest(new { message = "Can only add participants to group chats" });

            if (!chat.AdminIds.Contains(userId))
                return Forbid();

            foreach (var participantId in request.UserIds)
            {
                if (chat.Participants.Any(p => p.UserId == participantId))
                    continue;

                var user = await _userRepository.GetByIdAsync(participantId);
                if (user != null)
                {
                    chat.Participants.Add(new ChatParticipant
                    {
                        UserId = user.Id,
                        DisplayName = user.DisplayName,
                        AvatarUrl = user.AvatarUrl ?? "",
                        JoinedAt = DateTime.UtcNow
                    });
                }
            }

            chat.UpdatedAt = DateTime.UtcNow;
            await _chatRepository.UpdateAsync(chat);

            // Notify via SignalR
            await _hubContext.Clients.Group(chatId).SendAsync("ParticipantsAdded", chatId, request.UserIds);

            return Ok(MapToChatDto(chat, userId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add participants to chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to add participants" });
        }
    }

    /// <summary>
    /// Remove a participant from a group chat
    /// </summary>
    [HttpDelete("{chatId}/participants/{participantId}")]
    public async Task<IActionResult> RemoveParticipant(string chatId, string participantId)
    {
        try
        {
            var userId = GetUserId();
            var chat = await _chatRepository.GetByIdAsync(chatId);

            if (chat == null)
                return NotFound(new { message = "Chat not found" });

            if (chat.ChatType != "group")
                return BadRequest(new { message = "Can only remove participants from group chats" });

            // Only admins can remove others, anyone can remove themselves
            if (participantId != userId && !chat.AdminIds.Contains(userId))
                return Forbid();

            chat.Participants.RemoveAll(p => p.UserId == participantId);
            chat.AdminIds.Remove(participantId);
            chat.UpdatedAt = DateTime.UtcNow;
            await _chatRepository.UpdateAsync(chat);

            // Notify via SignalR
            await _hubContext.Clients.Group(chatId).SendAsync("ParticipantRemoved", chatId, participantId);

            return Ok(new { message = "Participant removed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove participant from chat {ChatId}", chatId);
            return StatusCode(500, new { message = "Failed to remove participant" });
        }
    }

    private ChatDto MapToChatDto(Chat chat, string currentUserId)
    {
        // For direct chats, get the other participant's name as the chat name
        string displayName = chat.GroupName ?? "";
        string displayAvatar = chat.GroupAvatar ?? "";

        if (chat.ChatType == "direct")
        {
            var otherParticipant = chat.Participants.FirstOrDefault(p => p.UserId != currentUserId);
            if (otherParticipant != null)
            {
                displayName = otherParticipant.DisplayName;
                displayAvatar = otherParticipant.AvatarUrl;
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(displayName))
            {
                var names = chat.Participants
                    .Where(p => p.UserId != currentUserId)
                    .Select(p => p.DisplayName)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .ToList();

                var shown = names.Take(4).ToList();
                var extra = names.Count - shown.Count;
                displayName = string.Join(" · ", shown) + (extra > 0 ? $" +{extra}" : "");
                if (string.IsNullOrWhiteSpace(displayName))
                {
                    displayName = "Group";
                }
            }

            if (string.IsNullOrWhiteSpace(displayAvatar))
            {
                displayAvatar = chat.Participants.FirstOrDefault(p => p.UserId != currentUserId)?.AvatarUrl ?? "";
            }
        }

        return new ChatDto
        {
            Id = chat.Id,
            ChatType = chat.ChatType,
            Name = displayName,
            Avatar = displayAvatar,
            Participants = chat.Participants.Select(p => new ParticipantDto
            {
                UserId = p.UserId,
                DisplayName = p.DisplayName,
                AvatarUrl = p.AvatarUrl,
                IsOnline = ChatHub.IsUserOnline(p.UserId)
            }).ToList(),
            LastMessage = chat.LastMessage != null ? new LastMessageDto
            {
                Text = chat.LastMessage.Text,
                SenderId = chat.LastMessage.SenderId,
                SenderName = chat.LastMessage.SenderName,
                MessageType = chat.LastMessage.MessageType,
                Timestamp = chat.LastMessage.Timestamp
            } : null,
            UnreadCount = 0, // TODO: Implement unread count
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        };
    }

    private static string GetMessagePreviewText(string? messageType)
    {
        return messageType switch
        {
            "image" => "[Image]",
            "video" => "[Video]",
            "voice" => "[Voice]",
            "file" => "[File]",
            _ => "[Message]"
        };
    }

    private static bool ShouldTriggerAgent(Chat chat, Message message)
    {
        if (message.SenderId == AgentUserId)
            return false;

        if (IsDirectChatWithAgent(chat))
            return true;

        return message.MessageType == "text" &&
            !string.IsNullOrWhiteSpace(message.Content?.Text) &&
            message.Content.Text.Contains("@@", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDirectChatWithAgent(Chat chat)
    {
        return chat.ChatType == "direct" &&
            chat.Participants.Count == 2 &&
            chat.Participants.Any(p => p.UserId == AgentUserId);
    }

    private async Task TryAddMentionedParticipantsAsync(Chat chat, Message message, string currentUserId)
    {
        if (message.MessageType != "text" || string.IsNullOrWhiteSpace(message.Content?.Text))
            return;

        var mentionNames = ExtractMentions(message.Content.Text).ToList();
        if (mentionNames.Count == 0)
            return;

        var addedUsers = new List<User>();

        foreach (var mention in mentionNames)
        {
            var candidates = await _userRepository.SearchUsersAsync(mention, currentUserId, 10);
            var match = candidates.FirstOrDefault(u =>
                string.Equals(u.DisplayName, mention, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(u.Handle, mention, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(u.Email.Split('@')[0], mention, StringComparison.OrdinalIgnoreCase));

            var userToAdd = match ?? candidates.FirstOrDefault();
            if (userToAdd == null)
                continue;

            if (chat.Participants.Any(p => p.UserId == userToAdd.Id))
                continue;

            chat.Participants.Add(new ChatParticipant
            {
                UserId = userToAdd.Id,
                DisplayName = userToAdd.DisplayName,
                AvatarUrl = userToAdd.AvatarUrl ?? string.Empty,
                JoinedAt = DateTime.UtcNow
            });
            addedUsers.Add(userToAdd);
        }

        if (addedUsers.Count == 0)
            return;

        if (chat.ChatType == "direct")
        {
            chat.ChatType = "group";
            if (chat.AdminIds == null || chat.AdminIds.Count == 0)
            {
                chat.AdminIds = new List<string> { currentUserId };
            }
            if (string.IsNullOrWhiteSpace(chat.GroupName))
            {
                chat.GroupName = BuildGroupName(chat.Participants);
            }
        }

        chat.UpdatedAt = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat);

        await _hubContext.Clients.Group(chat.Id)
            .SendAsync("ChatUpdated", MapToChatDto(chat, currentUserId));

        await _hubContext.Clients.Group(chat.Id)
            .SendAsync("ParticipantsAdded", chat.Id, addedUsers.Select(u => u.Id).ToList());

        foreach (var user in addedUsers)
        {
            await _hubContext.Clients.User(user.Id)
                .SendAsync("ChatCreated", MapToChatDto(chat, user.Id));
        }
    }

    private static IEnumerable<string> ExtractMentions(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return Enumerable.Empty<string>();

        var matches = Regex.Matches(text, "@([A-Za-z0-9_.-]+)");
        return matches.Select(m => m.Groups[1].Value).Where(m => !string.IsNullOrWhiteSpace(m)).Distinct();
    }

    private static string BuildGroupName(IEnumerable<ChatParticipant> participants)
    {
        var names = participants
            .Select(p => p.DisplayName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .Take(3)
            .ToList();

        if (names.Count == 0)
            return "Group Chat";

        var baseName = string.Join(", ", names);
        if (participants.Count() > names.Count)
            baseName += " +";

        return baseName;
    }

    private async Task EnsureAgentParticipantAsync(Chat chat)
    {
        if (chat.Participants.Any(p => p.UserId == AgentUserId))
            return;

        var agent = await _userRepository.GetByIdAsync(AgentUserId);
        if (agent == null)
            return;

        chat.Participants.Add(new ChatParticipant
        {
            UserId = agent.Id,
            DisplayName = agent.DisplayName,
            AvatarUrl = agent.AvatarUrl ?? string.Empty,
            JoinedAt = DateTime.UtcNow
        });
        chat.UpdatedAt = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat);
    }

    private static async Task<string> BuildAgentPromptAsync(Message message)
    {
        var cleaned = message.Content.Text ?? string.Empty;
        cleaned = cleaned.Replace("@@", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (string.IsNullOrWhiteSpace(cleaned))
            cleaned = message.Content.Text ?? string.Empty;

        return await Task.FromResult(cleaned);
    }

    private async Task<List<(string SenderName, string Message)>> BuildHistoryAsync(string chatId)
    {
        var historyMessages = await _messageRepository.GetChatMessagesAsync(chatId, 10);
        return historyMessages
            .Where(m => !m.IsDeleted)
            .Select(m => (m.SenderName, m.Content.Text ?? string.Empty))
            .Where(h => !string.IsNullOrWhiteSpace(h.Item2))
            .ToList();
    }
}

public class AddParticipantsRequest
{
    public List<string> UserIds { get; set; } = new();
}
