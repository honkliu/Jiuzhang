using System.Security.Claims;
using System.Text;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Photo;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Repositories.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/admin/gallery")]
public class AdminGalleryController : ControllerBase
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif"
    };

    private readonly IUserRepository _userRepository;
    private readonly IChatUserRepository _chatUserRepository;
    private readonly IPhotoRepository _photoRepository;
    private readonly IReceiptRepository _receiptRepository;
    private readonly IFamilyTreeRepository _familyTreeRepository;
    private readonly IFamilyTreeVisibilityRepository _familyTreeVisibilityRepository;
    private readonly IFamilyPersonRepository _familyPersonRepository;
    private readonly IFamilySectionRepository _familySectionRepository;
    private readonly IFamilyPageRepository _familyPageRepository;
    private readonly INotebookRepository _notebookRepository;
    private readonly INotebookVisibilityRepository _notebookVisibilityRepository;
    private readonly INotebookSectionRepository _notebookSectionRepository;
    private readonly INotebookPageRepository _notebookPageRepository;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly IMongoCollection<Message> _messages;
    private readonly IMongoCollection<Moment> _moments;

    public AdminGalleryController(
        IUserRepository userRepository,
        IChatUserRepository chatUserRepository,
        IPhotoRepository photoRepository,
        IReceiptRepository receiptRepository,
        IFamilyTreeRepository familyTreeRepository,
        IFamilyTreeVisibilityRepository familyTreeVisibilityRepository,
        IFamilyPersonRepository familyPersonRepository,
        IFamilySectionRepository familySectionRepository,
        IFamilyPageRepository familyPageRepository,
        INotebookRepository notebookRepository,
        INotebookVisibilityRepository notebookVisibilityRepository,
        INotebookSectionRepository notebookSectionRepository,
        INotebookPageRepository notebookPageRepository,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        IMongoClient mongoClient)
    {
        _userRepository = userRepository;
        _chatUserRepository = chatUserRepository;
        _photoRepository = photoRepository;
        _receiptRepository = receiptRepository;
        _familyTreeRepository = familyTreeRepository;
        _familyTreeVisibilityRepository = familyTreeVisibilityRepository;
        _familyPersonRepository = familyPersonRepository;
        _familySectionRepository = familySectionRepository;
        _familyPageRepository = familyPageRepository;
        _notebookRepository = notebookRepository;
        _notebookVisibilityRepository = notebookVisibilityRepository;
        _notebookSectionRepository = notebookSectionRepository;
        _notebookPageRepository = notebookPageRepository;
        _configuration = configuration;
        _environment = environment;

        var database = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _messages = database.GetCollection<Message>(configuration["MongoDB:Collections:Messages"] ?? "Messages");
        _moments = database.GetCollection<Moment>(configuration["MongoDB:Collections:Moments"] ?? "Moments");
    }

    [HttpGet("photos")]
    public async Task<IActionResult> GetPhotos()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
        {
            return Unauthorized();
        }

        var uploadsRoot = GetUploadsRoot();
        if (!Directory.Exists(uploadsRoot))
        {
            return Ok(Array.Empty<PhotoResponse>());
        }

        var files = Directory.EnumerateFiles(uploadsRoot, "*", SearchOption.AllDirectories)
            .Where(IsImageFile)
            .ToList();

        if (!IsSuperUser(currentUser))
        {
            var allowedUrls = await GetAllowedImageUrlsAsync(currentUser);
            var allowedRelativePaths = BuildAllowedRelativePathSet(allowedUrls);
            var allowedSourceKeys = allowedRelativePaths.Select(ToGalleryFileKey).Where(key => key != null).Select(key => key!).ToList();
            files = files
                .Where(filePath => IsAllowedGalleryFile(filePath, allowedRelativePaths, allowedSourceKeys))
                .ToList();
        }

        var photos = files
            .Select(ToPhotoResponse)
            .OrderByDescending(photo => photo.UploadedAt)
            .ToList();

        return Ok(photos);
    }

    [HttpDelete("photos/{id}")]
    public async Task<IActionResult> DeletePhoto(string id)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null)
        {
            return Unauthorized();
        }

        if (!IsSuperUser(currentUser))
        {
            return Forbid();
        }

        var filePath = ResolveGalleryFilePath(id);
        if (filePath == null || !IsImageFile(filePath))
        {
            return BadRequest(new { message = "Invalid gallery photo id." });
        }

        DeletePhotoFileAndGeneratedDescendants(filePath);
        return NoContent();
    }

    private async Task<User?> GetCurrentUserAsync()
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(currentUserId))
        {
            return null;
        }

        return await _userRepository.GetByIdAsync(currentUserId);
    }

    private static bool IsSuperUser(User user)
    {
        if (!user.IsAdmin)
        {
            return false;
        }

        var domain = string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;
        return DomainRules.IsSuperDomain(domain);
    }

    private async Task<HashSet<string>> GetAllowedImageUrlsAsync(User user)
    {
        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddUrls(urls, (await _photoRepository.GetByOwnerIdAsync(user.Id)).Select(photo => photo.ImageUrl));
        AddUrls(urls, await GetOwnMomentImageUrlsAsync(user.Id));
        AddUrls(urls, await GetChatImageUrlsAsync(user.Id));
        AddUrls(urls, await GetReceiptImageUrlsAsync(user.Id));
        AddUrls(urls, await GetFamilyImageUrlsAsync(user));
        AddUrls(urls, await GetNotebookImageUrlsAsync(user));

        return urls;
    }

    private async Task<IEnumerable<string?>> GetOwnMomentImageUrlsAsync(string userId)
    {
        var moments = await _moments.Find(moment => moment.Type == "moment" && moment.UserId == userId).ToListAsync();
        return moments.SelectMany(moment => moment.Content.MediaUrls ?? new List<string>());
    }

    private async Task<IEnumerable<string?>> GetChatImageUrlsAsync(string userId)
    {
        var chatUsers = await _chatUserRepository.GetUserChatsAsync(userId);
        if (chatUsers.Count == 0)
        {
            return Array.Empty<string?>();
        }

        var chatIds = chatUsers.Select(chatUser => chatUser.ChatId).Distinct(StringComparer.Ordinal).ToList();
        var clearedByChatId = chatUsers.ToDictionary(chatUser => chatUser.ChatId, chatUser => chatUser.ClearedAt, StringComparer.Ordinal);
        var messages = await _messages
            .Find(message => chatIds.Contains(message.ChatId)
                && message.Type == "message"
                && !message.IsDeleted
                && message.MessageType == "image")
            .ToListAsync();

        return messages
            .Where(message => !clearedByChatId.TryGetValue(message.ChatId, out var clearedAt) || clearedAt == null || message.Timestamp > clearedAt.Value)
            .SelectMany(message => new[] { message.Content.MediaUrl, message.Content.ThumbnailUrl });
    }

    private async Task<IEnumerable<string?>> GetReceiptImageUrlsAsync(string userId)
    {
        var receipts = await _receiptRepository.GetByOwnerIdAsync(userId);
        return receipts.SelectMany(receipt => new[] { receipt.ImageUrl }.Concat(receipt.AdditionalImageUrls));
    }

    private async Task<IEnumerable<string?>> GetFamilyImageUrlsAsync(User user)
    {
        var urls = new List<string?>();
        var trees = await GetVisibleFamilyTreesAsync(user);

        foreach (var tree in trees)
        {
            var persons = await _familyPersonRepository.GetByTreeIdAsync(tree.Id);
            foreach (var person in persons)
            {
                urls.Add(person.AvatarUrl);
                urls.AddRange(person.Photos.Select(photo => photo.Url));
            }

            var sections = await _familySectionRepository.GetByTreeIdAsync(tree.Id);
            foreach (var section in sections)
            {
                var pages = await _familyPageRepository.GetBySectionIdAsync(section.Id);
                urls.AddRange(pages.SelectMany(page => page.Elements.Select(element => element.ImageUrl)));
            }
        }

        return urls;
    }

    private async Task<List<FamilyTree>> GetVisibleFamilyTreesAsync(User user)
    {
        var treesById = new Dictionary<string, FamilyTree>(StringComparer.Ordinal);

        foreach (var domain in FamilyAccessPolicy.GetVisibleDomains(_configuration, user))
        {
            foreach (var tree in await _familyTreeRepository.GetByDomainAsync(domain))
            {
                treesById[tree.Id] = tree;
            }
        }

        var explicitVisibilities = new List<FamilyTreeVisibility>();
        explicitVisibilities.AddRange(await _familyTreeVisibilityRepository.GetByEmailAsync(FamilyAccessPolicy.NormalizeEmail(user.Email)));
        var userDomain = FamilyAccessPolicy.ResolveDomain(user);
        if (!string.IsNullOrWhiteSpace(userDomain))
        {
            explicitVisibilities.AddRange(await _familyTreeVisibilityRepository.GetByDomainAsync(userDomain));
        }

        foreach (var visibility in explicitVisibilities)
        {
            if (treesById.ContainsKey(visibility.TreeId))
            {
                continue;
            }

            var tree = await _familyTreeRepository.GetByIdAsync(visibility.TreeId);
            if (tree != null && FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility))
            {
                treesById[tree.Id] = tree;
            }
        }

        return treesById.Values.ToList();
    }

    private async Task<IEnumerable<string?>> GetNotebookImageUrlsAsync(User user)
    {
        var urls = new List<string?>();
        var notebooks = await GetVisibleNotebooksAsync(user);

        foreach (var notebook in notebooks)
        {
            var sections = await _notebookSectionRepository.GetByNotebookIdAsync(notebook.Id);
            foreach (var section in sections)
            {
                var pages = await _notebookPageRepository.GetBySectionIdAsync(section.Id);
                urls.AddRange(pages.SelectMany(page => page.Elements.Select(element => element.ImageUrl)));
            }
        }

        return urls;
    }

    private async Task<List<Notebook>> GetVisibleNotebooksAsync(User user)
    {
        var notebooksById = new Dictionary<string, Notebook>(StringComparer.Ordinal);

        foreach (var notebook in await _notebookRepository.GetByOwnerIdAsync(user.Id))
        {
            notebooksById[notebook.Id] = notebook;
        }

        var explicitVisibilities = new List<NotebookVisibility>();
        explicitVisibilities.AddRange(await _notebookVisibilityRepository.GetByEmailAsync(FamilyAccessPolicy.NormalizeEmail(user.Email)));
        var userDomain = FamilyAccessPolicy.ResolveDomain(user);
        if (!string.IsNullOrWhiteSpace(userDomain))
        {
            explicitVisibilities.AddRange(await _notebookVisibilityRepository.GetByDomainAsync(userDomain));
        }

        foreach (var visibility in explicitVisibilities)
        {
            if (notebooksById.ContainsKey(visibility.NotebookId))
            {
                continue;
            }

            var notebook = await _notebookRepository.GetByIdAsync(visibility.NotebookId);
            if (notebook != null && NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility))
            {
                notebooksById[notebook.Id] = notebook;
            }
        }

        return notebooksById.Values.ToList();
    }

    private static void AddUrls(HashSet<string> urls, IEnumerable<string?> values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                urls.Add(value);
            }
        }
    }

    private string GetWebRootPath()
    {
        return _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
    }

    private string GetUploadsRoot()
    {
        return Path.GetFullPath(Path.Combine(GetWebRootPath(), "uploads"));
    }

    private string GetGalleryRelativePath(string filePath)
    {
        return Path.GetRelativePath(GetWebRootPath(), filePath)
            .Replace(Path.DirectorySeparatorChar, '/');
    }

    private static HashSet<string> BuildAllowedRelativePathSet(IEnumerable<string> urls)
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var url in urls)
        {
            var relativePath = TryGetUploadsRelativePath(url);
            if (!string.IsNullOrWhiteSpace(relativePath))
            {
                paths.Add(relativePath);
            }
        }

        return paths;
    }

    private static string? TryGetUploadsRelativePath(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        var withoutQuery = url.Split('?', '#')[0].Trim();
        string path;
        if (Uri.TryCreate(withoutQuery, UriKind.Absolute, out var absoluteUri))
        {
            path = absoluteUri.AbsolutePath;
        }
        else
        {
            path = withoutQuery;
        }

        path = Uri.UnescapeDataString(path).Replace('\\', '/').TrimStart('/');
        return path.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase) ? path : null;
    }

    private bool IsAllowedGalleryFile(string filePath, HashSet<string> allowedRelativePaths, List<GalleryFileKey> allowedSourceKeys)
    {
        var relativePath = GetGalleryRelativePath(filePath);
        if (allowedRelativePaths.Contains(relativePath))
        {
            return true;
        }

        var fileKey = ToGalleryFileKey(relativePath);
        if (fileKey == null)
        {
            return false;
        }

        return allowedSourceKeys.Any(sourceKey =>
            string.Equals(sourceKey.Directory, fileKey.Directory, StringComparison.OrdinalIgnoreCase)
            && string.Equals(sourceKey.Extension, fileKey.Extension, StringComparison.OrdinalIgnoreCase)
            && IsGeneratedDescendantName(fileKey.BaseName, sourceKey.BaseName));
    }

    private static GalleryFileKey? ToGalleryFileKey(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        var normalized = relativePath.Replace('\\', '/');
        var slashIndex = normalized.LastIndexOf('/');
        var directory = slashIndex >= 0 ? normalized[..slashIndex] : string.Empty;
        var fileName = slashIndex >= 0 ? normalized[(slashIndex + 1)..] : normalized;
        var extension = Path.GetExtension(fileName);
        var baseName = Path.GetFileNameWithoutExtension(fileName);

        return string.IsNullOrWhiteSpace(baseName) || string.IsNullOrWhiteSpace(extension)
            ? null
            : new GalleryFileKey(directory, baseName, extension);
    }

    private PhotoResponse ToPhotoResponse(string filePath)
    {
        var fileInfo = new FileInfo(filePath);
        var relativePath = GetGalleryRelativePath(filePath);
        var fileName = Path.GetFileName(filePath);
        var timestamp = fileInfo.LastWriteTimeUtc;

        return new PhotoResponse
        {
            Id = EncodeGalleryId(relativePath),
            OwnerId = "kankan@kankan",
            FileName = fileName,
            ContentType = GetContentType(filePath),
            FileSize = fileInfo.Length,
            FilePath = filePath,
            ImageUrl = ToPublicUrl(relativePath),
            UploadedAt = timestamp,
            CapturedDate = timestamp,
            AssociatedReceiptIds = new List<string>(),
            Tags = new List<string> { relativePath.StartsWith("uploads/receipts/", StringComparison.OrdinalIgnoreCase) ? "receipts" : "uploads" },
            Notes = relativePath,
            CreatedAt = timestamp,
            UpdatedAt = timestamp,
        };
    }

    private string? ResolveGalleryFilePath(string id)
    {
        var relativePath = DecodeGalleryId(id);
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        relativePath = relativePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var combinedPath = Path.GetFullPath(Path.Combine(GetWebRootPath(), relativePath));
        var uploadsRoot = GetUploadsRoot();

        if (!combinedPath.StartsWith(uploadsRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(combinedPath, uploadsRoot, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return combinedPath;
    }

    private static bool IsImageFile(string filePath)
    {
        return ImageExtensions.Contains(Path.GetExtension(filePath));
    }

    private static string ToPublicUrl(string relativePath)
    {
        return "/" + string.Join('/', relativePath
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString));
    }

    private static string GetContentType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".bmp" => "image/bmp",
            ".heic" => "image/heic",
            ".heif" => "image/heif",
            _ => "application/octet-stream",
        };
    }

    private static string EncodeGalleryId(string relativePath)
    {
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(relativePath))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? DecodeGalleryId(string id)
    {
        try
        {
            var base64 = id.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch
        {
            return null;
        }
    }

    private static void DeletePhotoFileAndGeneratedDescendants(string filePath)
    {
        var directory = Path.GetDirectoryName(filePath);
        var baseName = Path.GetFileNameWithoutExtension(filePath);
        var extension = Path.GetExtension(filePath);

        if (System.IO.File.Exists(filePath))
        {
            System.IO.File.Delete(filePath);
        }

        if (string.IsNullOrWhiteSpace(directory)
            || string.IsNullOrWhiteSpace(baseName)
            || string.IsNullOrWhiteSpace(extension)
            || !Directory.Exists(directory))
        {
            return;
        }

        var searchPattern = $"{baseName}_*{extension}";
        foreach (var generatedPath in Directory.EnumerateFiles(directory, searchPattern, SearchOption.TopDirectoryOnly))
        {
            var generatedBaseName = Path.GetFileNameWithoutExtension(generatedPath);
            if (IsGeneratedDescendantName(generatedBaseName, baseName))
            {
                System.IO.File.Delete(generatedPath);
            }
        }
    }

    private static bool IsGeneratedDescendantName(string generatedBaseName, string sourceBaseName)
    {
        if (!generatedBaseName.StartsWith(sourceBaseName + "_", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var suffix = generatedBaseName.Substring(sourceBaseName.Length + 1);
        var parts = suffix.Split('_', StringSplitOptions.None);
        return parts.Length > 0
            && parts.All(part => int.TryParse(part, out var index) && index > 0);
    }

    private sealed record GalleryFileKey(string Directory, string BaseName, string Extension);
}