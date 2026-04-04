using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.IO.Compression;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Family;
using KanKan.API.Models.DTOs.Notebook;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/notebook")]
public class NotebookController : ControllerBase
{
    private readonly INotebookRepository _nbRepo;
    private readonly INotebookVisibilityRepository _visRepo;
    private readonly INotebookSectionRepository _secRepo;
    private readonly INotebookPageRepository _pageRepo;
    private readonly IUserRepository _userRepo;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<NotebookController> _logger;
    private static readonly JsonSerializerOptions ArchiveJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public NotebookController(
        INotebookRepository nbRepo,
        INotebookVisibilityRepository visRepo,
        INotebookSectionRepository secRepo,
        INotebookPageRepository pageRepo,
        IUserRepository userRepo,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ILogger<NotebookController> logger)
    {
        _nbRepo = nbRepo;
        _visRepo = visRepo;
        _secRepo = secRepo;
        _pageRepo = pageRepo;
        _userRepo = userRepo;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    // ── Notebook CRUD ──────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> ListNotebooks()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var own = await _nbRepo.GetByOwnerIdAsync(user.Id);
        var email = FamilyAccessPolicy.NormalizeEmail(user.Email);
        var domain = FamilyAccessPolicy.ResolveDomain(user);
        var byEmail = await _visRepo.GetByEmailAsync(email);
        var byDomain = !string.IsNullOrEmpty(domain) ? await _visRepo.GetByDomainAsync(domain) : new List<NotebookVisibility>();

        var sharedIds = byEmail.Concat(byDomain).Select(v => v.NotebookId).Distinct()
            .Where(id => !own.Any(n => n.Id == id)).ToList();

        var shared = new List<Notebook>();
        foreach (var id in sharedIds)
        {
            var nb = await _nbRepo.GetByIdAsync(id);
            if (nb != null) shared.Add(nb);
        }

        var all = own.Concat(shared).DistinctBy(n => n.Id)
            .Where(n => string.IsNullOrEmpty(n.LinkedTreeId))
            .OrderByDescending(n => n.UpdatedAt).ToList();

        var responses = new List<NotebookResponse>();
        var ownerCache = new Dictionary<string, string>();
        foreach (var n in all)
        {
            var vis = await _visRepo.GetByNotebookIdAsync(n.Id);
            if (!ownerCache.TryGetValue(n.OwnerId, out var ownerName))
            {
                var owner = await _userRepo.GetByIdAsync(n.OwnerId);
                ownerName = owner?.DisplayName ?? "";
                ownerCache[n.OwnerId] = ownerName;
            }
            responses.Add(ToResponse(n, user, vis, ownerName));
        }
        return Ok(responses);
    }

    [HttpGet("{notebookId}")]
    public async Task<IActionResult> GetNotebook(string notebookId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var owner = await _userRepo.GetByIdAsync(notebook.OwnerId);
        return Ok(ToResponse(notebook, user, visibility, owner?.DisplayName ?? ""));
    }

    [HttpPost]
    public async Task<IActionResult> CreateNotebook([FromBody] CreateNotebookRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var notebook = new Notebook
        {
            Id = $"nb_{Guid.NewGuid():N}",
            Name = req.Name,
            OwnerId = user.Id,
            Domain = FamilyAccessPolicy.NormalizeDomain(req.Domain ?? FamilyAccessPolicy.ResolveDomain(user)),
        };
        await _nbRepo.CreateAsync(notebook);
        return Ok(ToResponse(notebook, user));
    }

    [HttpPut("{notebookId}")]
    public async Task<IActionResult> UpdateNotebook(string notebookId, [FromBody] UpdateNotebookRequest req)
    {
        var (user, notebook) = await GetUserAndNotebookAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanManageNotebook(user, notebook)) return Forbid();

        if (req.Name != null) notebook.Name = req.Name;
        await _nbRepo.UpdateAsync(notebook);
        return Ok(ToResponse(notebook, user));
    }

    [HttpDelete("{notebookId}")]
    public async Task<IActionResult> DeleteNotebook(string notebookId)
    {
        var (user, notebook) = await GetUserAndNotebookAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanManageNotebook(user, notebook)) return Forbid();

        // Delete images from all pages first
        var sections = await _secRepo.GetByNotebookIdAsync(notebookId);
        foreach (var sec in sections)
        {
            var pages = await _pageRepo.GetBySectionIdAsync(sec.Id);
            await DeletePagesWithImages(pages);
        }

        await _pageRepo.DeleteByNotebookIdAsync(notebookId);
        await _secRepo.DeleteByNotebookIdAsync(notebookId);
        await _visRepo.DeleteByNotebookIdAsync(notebookId);
        await _nbRepo.DeleteAsync(notebookId);
        return Ok(new { message = "Notebook deleted" });
    }

    // ── Visibility ─────────────────────────────────────────────────────────

    [HttpGet("{notebookId}/visibility")]
    public async Task<IActionResult> GetVisibility(string notebookId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        return Ok(new NotebookVisibilityResponse
        {
            NotebookId = notebookId,
            UserViewers = visibility?.UserViewers ?? new(),
            UserEditors = visibility?.UserEditors ?? new(),
            DomainViewers = visibility?.DomainViewers ?? new(),
            DomainEditors = visibility?.DomainEditors ?? new(),
        });
    }

    [HttpPut("{notebookId}/visibility")]
    public async Task<IActionResult> UpdateVisibility(string notebookId, [FromBody] UpdateNotebookVisibilityRequest req)
    {
        var (user, notebook) = await GetUserAndNotebookAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanManageNotebook(user, notebook)) return Forbid();

        var vis = new NotebookVisibility
        {
            NotebookId = notebookId,
            UserViewers = (req.UserViewers ?? new()).Select(FamilyAccessPolicy.NormalizeEmail).Where(e => e.Length > 0).ToList(),
            UserEditors = (req.UserEditors ?? new()).Select(FamilyAccessPolicy.NormalizeEmail).Where(e => e.Length > 0).ToList(),
            DomainViewers = (req.DomainViewers ?? new()).Select(FamilyAccessPolicy.NormalizeDomain).Where(d => d.Length > 0).ToList(),
            DomainEditors = (req.DomainEditors ?? new()).Select(FamilyAccessPolicy.NormalizeDomain).Where(d => d.Length > 0).ToList(),
        };
        // Dedup: remove viewers that are also editors
        vis.UserViewers = vis.UserViewers.Where(e => !vis.UserEditors.Contains(e, StringComparer.OrdinalIgnoreCase)).ToList();
        vis.DomainViewers = vis.DomainViewers.Where(d => !vis.DomainEditors.Contains(d, StringComparer.OrdinalIgnoreCase)).ToList();

        await _visRepo.UpsertAsync(vis);
        return Ok(new NotebookVisibilityResponse
        {
            NotebookId = notebookId,
            UserViewers = vis.UserViewers,
            UserEditors = vis.UserEditors,
            DomainViewers = vis.DomainViewers,
            DomainEditors = vis.DomainEditors,
        });
    }

    // ── Sections ───────────────────────────────────────────────────────────

    [HttpGet("{notebookId}/sections")]
    public async Task<IActionResult> ListSections(string notebookId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var sections = await _secRepo.GetByNotebookIdAsync(notebookId);
        return Ok(sections.Select(ToSectionResponse).ToList());
    }

    [HttpPost("{notebookId}/sections")]
    public async Task<IActionResult> CreateSection(string notebookId, [FromBody] CreateNotebookSectionRequest req)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var existing = await _secRepo.GetByNotebookIdAsync(notebookId);
        var sortOrder = req.SortOrder ?? (existing.Count > 0 ? existing.Max(s => s.SortOrder) + 1 : 0);

        var section = new NotebookSection
        {
            Id = $"nbsec_{Guid.NewGuid():N}",
            NotebookId = notebookId,
            Domain = notebook.Domain,
            Name = req.Name,
            SortOrder = sortOrder,
        };
        await _secRepo.CreateAsync(section);

        // Auto-create one blank page
        await _pageRepo.CreateAsync(new NotebookPage
        {
            Id = $"nbpage_{Guid.NewGuid():N}",
            SectionId = section.Id,
            NotebookId = notebookId,
            Domain = notebook.Domain,
            PageNumber = 1,
            Elements = new List<PageElement>(),
        });

        return Ok(ToSectionResponse(section));
    }

    [HttpPut("{notebookId}/sections/{sectionId}")]
    public async Task<IActionResult> UpdateSection(string notebookId, string sectionId, [FromBody] UpdateNotebookSectionRequest req)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var section = await _secRepo.GetByIdAsync(sectionId);
        if (section == null || section.NotebookId != notebookId) return NotFound();

        if (req.Name != null) section.Name = req.Name;
        if (req.SortOrder.HasValue) section.SortOrder = req.SortOrder.Value;

        await _secRepo.UpdateAsync(section);
        return Ok(ToSectionResponse(section));
    }

    [HttpDelete("{notebookId}/sections/{sectionId}")]
    public async Task<IActionResult> DeleteSection(string notebookId, string sectionId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var section = await _secRepo.GetByIdAsync(sectionId);
        if (section == null || section.NotebookId != notebookId) return NotFound();

        var pages = await _pageRepo.GetBySectionIdAsync(sectionId);
        await DeletePagesWithImages(pages);
        await _pageRepo.DeleteBySectionIdAsync(sectionId);
        await _secRepo.DeleteAsync(sectionId);
        return Ok(new { message = "Section deleted" });
    }

    // ── Pages ──────────────────────────────────────────────────────────────

    [HttpGet("{notebookId}/sections/{sectionId}/pages")]
    public async Task<IActionResult> ListPages(string notebookId, string sectionId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var section = await _secRepo.GetByIdAsync(sectionId);
        if (section == null || section.NotebookId != notebookId) return NotFound();

        var pages = await _pageRepo.GetBySectionIdAsync(sectionId);
        return Ok(pages.Select(p => new NotebookPageSummaryResponse { Id = p.Id, PageNumber = p.PageNumber }).ToList());
    }

    [HttpGet("{notebookId}/pages/{pageId}")]
    public async Task<IActionResult> GetPage(string notebookId, string pageId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.NotebookId != notebookId) return NotFound();

        return Ok(ToPageResponse(page));
    }

    [HttpPost("{notebookId}/sections/{sectionId}/pages")]
    public async Task<IActionResult> CreatePage(string notebookId, string sectionId, [FromBody] CreateNotebookPageRequest? req)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var section = await _secRepo.GetByIdAsync(sectionId);
        if (section == null || section.NotebookId != notebookId) return NotFound();

        var existingPages = await _pageRepo.GetBySectionIdAsync(sectionId);
        var pageNumber = req?.PageNumber ?? (existingPages.Count > 0 ? existingPages.Max(p => p.PageNumber) + 1 : 1);

        var page = new NotebookPage
        {
            Id = $"nbpage_{Guid.NewGuid():N}",
            SectionId = sectionId,
            NotebookId = notebookId,
            Domain = notebook.Domain,
            PageNumber = pageNumber,
            Elements = new List<PageElement>(),
        };
        await _pageRepo.CreateAsync(page);
        return Ok(ToPageResponse(page));
    }

    [HttpPut("{notebookId}/pages/{pageId}")]
    public async Task<IActionResult> UpdatePage(string notebookId, string pageId, [FromBody] UpdateNotebookPageRequest req)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.NotebookId != notebookId) return NotFound();

        if (req.PageNumber.HasValue) page.PageNumber = req.PageNumber.Value;
        if (req.Elements != null)
        {
            // Find images that were removed and delete their files
            var oldImageUrls = new HashSet<string>(
                page.Elements.Where(e => e.Type == "image" && !string.IsNullOrWhiteSpace(e.ImageUrl)).Select(e => e.ImageUrl!),
                StringComparer.OrdinalIgnoreCase);
            var newImageUrls = new HashSet<string>(
                req.Elements.Where(e => e.Type == "image" && !string.IsNullOrWhiteSpace(e.ImageUrl)).Select(e => e.ImageUrl!),
                StringComparer.OrdinalIgnoreCase);
            foreach (var removedUrl in oldImageUrls.Except(newImageUrls))
            {
                var path = ResolveLocalUploadPath(removedUrl);
                if (path != null)
                {
                    try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to delete removed image {Path}", path); }
                }
            }

            page.Elements = req.Elements.Select(e => new PageElement
            {
                Id = string.IsNullOrEmpty(e.Id) ? $"pelem_{Guid.NewGuid():N}" : e.Id,
                Type = e.Type,
                X = e.X, Y = e.Y, Width = e.Width, Height = e.Height,
                Text = e.Text, FontSize = e.FontSize, TextAlign = e.TextAlign ?? "left",
                ImageUrl = e.ImageUrl, ZIndex = e.ZIndex,
            }).ToList();
        }

        await _pageRepo.UpdateAsync(page);
        return Ok(ToPageResponse(page));
    }

    [HttpDelete("{notebookId}/pages/{pageId}")]
    public async Task<IActionResult> DeletePage(string notebookId, string pageId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.NotebookId != notebookId) return NotFound();

        DeletePageImages(page);
        await _pageRepo.DeleteAsync(pageId);
        return Ok(new { message = "Page deleted" });
    }

    // ── Export ──────────────────────────────────────────────────────────────

    [HttpGet("{notebookId}/export-archive")]
    public async Task<IActionResult> ExportArchive(string notebookId)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanViewNotebook(_configuration, user, notebook, visibility)) return Forbid();

        var sections = await _secRepo.GetByNotebookIdAsync(notebookId);

        using var ms = new MemoryStream();
        using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, true))
        {
            var hashCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var archiveSections = new List<NotebookArchiveSectionDto>();

            foreach (var sec in sections)
            {
                var pages = await _pageRepo.GetBySectionIdAsync(sec.Id);
                var archivePages = new List<NotebookArchivePageDto>();

                foreach (var page in pages)
                {
                    var archiveElements = new List<NotebookArchiveElementDto>();
                    foreach (var elem in page.Elements)
                    {
                        var archiveElem = new NotebookArchiveElementDto
                        {
                            Id = elem.Id, Type = elem.Type, X = elem.X, Y = elem.Y,
                            Width = elem.Width, Height = elem.Height,
                            Text = elem.Text, FontSize = elem.FontSize, TextAlign = elem.TextAlign,
                            ImageUrl = elem.ImageUrl, ZIndex = elem.ZIndex,
                        };

                        if (elem.Type == "image" && !string.IsNullOrWhiteSpace(elem.ImageUrl))
                        {
                            var localPath = ResolveLocalUploadPath(elem.ImageUrl);
                            if (localPath != null && System.IO.File.Exists(localPath))
                            {
                                var hash = await ComputeSha256HexAsync(localPath);
                                if (!hashCache.TryGetValue(hash, out var archivePath))
                                {
                                    var ext = Path.GetExtension(localPath);
                                    archivePath = $"photos/{Guid.NewGuid():N}{ext}";
                                    var entry = archive.CreateEntry(archivePath, CompressionLevel.Optimal);
                                    using var entryStream = entry.Open();
                                    using var fileStream = System.IO.File.OpenRead(localPath);
                                    await fileStream.CopyToAsync(entryStream);
                                    hashCache[hash] = archivePath;
                                }
                                archiveElem.ArchivePath = archivePath;
                            }
                        }
                        archiveElements.Add(archiveElem);
                    }

                    archivePages.Add(new NotebookArchivePageDto
                    {
                        Id = page.Id, PageNumber = page.PageNumber, Elements = archiveElements,
                    });
                }

                archiveSections.Add(new NotebookArchiveSectionDto
                {
                    Id = sec.Id, Name = sec.Name, SortOrder = sec.SortOrder, Pages = archivePages,
                });
            }

            var manifest = new NotebookArchiveResponse
            {
                FormatVersion = 1,
                ExportedAt = DateTime.UtcNow.ToString("o"),
                Notebook = new NotebookArchiveNotebookDto
                {
                    SourceNotebookId = notebook.Id,
                    Name = notebook.Name,
                    Domain = notebook.Domain,
                },
                Visibility = NotebookAccessPolicy.CanManageNotebook(user, notebook) ? new NotebookVisibilityResponse
                {
                    NotebookId = notebookId,
                    UserViewers = visibility?.UserViewers ?? new(),
                    UserEditors = visibility?.UserEditors ?? new(),
                    DomainViewers = visibility?.DomainViewers ?? new(),
                    DomainEditors = visibility?.DomainEditors ?? new(),
                } : null,
                Sections = archiveSections,
            };

            var jsonEntry = archive.CreateEntry("notebook.json", CompressionLevel.Optimal);
            using var jsonStream = jsonEntry.Open();
            await JsonSerializer.SerializeAsync(jsonStream, manifest, ArchiveJsonOptions);
        }

        ms.Position = 0;
        var fileName = $"{notebook.Name}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip";
        return File(ms.ToArray(), "application/zip", fileName);
    }

    // ── Import ─────────────────────────────────────────────────────────────

    [HttpPost("{notebookId}/import-archive")]
    [RequestSizeLimit(300 * 1024 * 1024)]
    public async Task<IActionResult> ImportArchive(string notebookId, [FromForm] IFormFile file)
    {
        var (user, notebook, visibility) = await GetUserNotebookVisAsync(notebookId);
        if (user == null) return Unauthorized();
        if (notebook == null) return NotFound();
        if (!NotebookAccessPolicy.CanEditNotebook(_configuration, user, notebook, visibility)) return Forbid();

        using var zipStream = file.OpenReadStream();
        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

        var jsonEntry = archive.GetEntry("notebook.json");
        if (jsonEntry == null) return BadRequest(new { message = "Invalid archive: missing notebook.json" });

        NotebookArchiveResponse manifest;
        using (var reader = jsonEntry.Open())
        {
            manifest = await JsonSerializer.DeserializeAsync<NotebookArchiveResponse>(reader, ArchiveJsonOptions)
                ?? throw new InvalidOperationException("Failed to parse notebook.json");
        }

        var importedFiles = new List<string>();
        var archivePathToUrl = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // Calculate sortOrder offset so imported sections come after existing ones
        var existingSections = await _secRepo.GetByNotebookIdAsync(notebookId);
        var sortOrderOffset = existingSections.Count > 0 ? existingSections.Max(s => s.SortOrder) + 1 : 0;

        try
        {
            foreach (var secDto in manifest.Sections)
            {
                var section = new NotebookSection
                {
                    Id = $"nbsec_{Guid.NewGuid():N}",
                    NotebookId = notebookId,
                    Domain = notebook.Domain,
                    Name = secDto.Name,
                    SortOrder = secDto.SortOrder + sortOrderOffset,
                };
                await _secRepo.CreateAsync(section);

                foreach (var pageDto in secDto.Pages)
                {
                    var elements = new List<PageElement>();
                    foreach (var elemDto in pageDto.Elements)
                    {
                        var imageUrl = elemDto.ImageUrl;
                        if (elemDto.Type == "image" && !string.IsNullOrWhiteSpace(elemDto.ArchivePath))
                        {
                            var imported = await ImportArchivedMediaAsync(archive, elemDto.ArchivePath, importedFiles, archivePathToUrl);
                            if (imported != null) imageUrl = imported;
                        }

                        elements.Add(new PageElement
                        {
                            Id = $"pelem_{Guid.NewGuid():N}",
                            Type = elemDto.Type,
                            X = elemDto.X, Y = elemDto.Y, Width = elemDto.Width, Height = elemDto.Height,
                            Text = elemDto.Text, FontSize = elemDto.FontSize, TextAlign = elemDto.TextAlign,
                            ImageUrl = imageUrl, ZIndex = elemDto.ZIndex,
                        });
                    }

                    await _pageRepo.CreateAsync(new NotebookPage
                    {
                        Id = $"nbpage_{Guid.NewGuid():N}",
                        SectionId = section.Id,
                        NotebookId = notebookId,
                        Domain = notebook.Domain,
                        PageNumber = pageDto.PageNumber,
                        Elements = elements,
                    });
                }
            }

            return Ok(new { message = $"Imported {manifest.Sections.Count} section(s)" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to import into notebook {NotebookId}", notebookId);
            foreach (var filePath in importedFiles)
            {
                try { if (System.IO.File.Exists(filePath)) System.IO.File.Delete(filePath); } catch { }
            }
            throw;
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async Task<User?> GetCurrentUserAsync()
    {
        var id = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
        return await _userRepo.GetByIdAsync(id);
    }

    private async Task<(User?, Notebook?)> GetUserAndNotebookAsync(string notebookId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return (null, null);
        var notebook = await _nbRepo.GetByIdAsync(notebookId);
        return (user, notebook);
    }

    private async Task<(User?, Notebook?, NotebookVisibility?)> GetUserNotebookVisAsync(string notebookId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return (null, null, null);
        var notebook = await _nbRepo.GetByIdAsync(notebookId);
        if (notebook == null) return (user, null, null);
        var visibility = await _visRepo.GetByNotebookIdAsync(notebookId);
        return (user, notebook, visibility);
    }

    private NotebookResponse ToResponse(Notebook n, User user, NotebookVisibility? visibility = null, string? ownerDisplayName = null) => new()
    {
        Id = n.Id, Name = n.Name, Domain = n.Domain, OwnerId = n.OwnerId,
        OwnerDisplayName = ownerDisplayName ?? (n.OwnerId == user.Id ? user.DisplayName : ""),
        CanEdit = NotebookAccessPolicy.CanEditNotebook(_configuration, user, n, visibility),
        CanManage = NotebookAccessPolicy.CanManageNotebook(user, n),
        CreatedAt = n.CreatedAt.ToString("o"), UpdatedAt = n.UpdatedAt.ToString("o"),
    };

    private static NotebookSectionResponse ToSectionResponse(NotebookSection s) => new()
    {
        Id = s.Id, NotebookId = s.NotebookId, Name = s.Name, SortOrder = s.SortOrder,
        CreatedAt = s.CreatedAt.ToString("o"), UpdatedAt = s.UpdatedAt.ToString("o"),
    };

    private static NotebookPageResponse ToPageResponse(NotebookPage p) => new()
    {
        Id = p.Id, SectionId = p.SectionId, NotebookId = p.NotebookId, PageNumber = p.PageNumber,
        Elements = p.Elements.Select(e => new PageElementDto
        {
            Id = e.Id, Type = e.Type, X = e.X, Y = e.Y, Width = e.Width, Height = e.Height,
            Text = e.Text, FontSize = e.FontSize, TextAlign = e.TextAlign,
            ImageUrl = e.ImageUrl, ZIndex = e.ZIndex,
        }).ToList(),
        CreatedAt = p.CreatedAt.ToString("o"), UpdatedAt = p.UpdatedAt.ToString("o"),
    };

    private string? ResolveLocalUploadPath(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !url.StartsWith("/uploads/")) return null;
        var fileName = url["/uploads/".Length..];
        if (string.IsNullOrWhiteSpace(fileName)) return null;
        return Path.Combine(GetUploadsRootPath(), fileName);
    }

    private string GetUploadsRootPath()
    {
        var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var uploadsPath = Path.Combine(webRoot, "uploads");
        Directory.CreateDirectory(uploadsPath);
        return uploadsPath;
    }

    private void DeletePageImages(NotebookPage page)
    {
        foreach (var elem in page.Elements)
        {
            if (elem.Type != "image" || string.IsNullOrWhiteSpace(elem.ImageUrl)) continue;
            var path = ResolveLocalUploadPath(elem.ImageUrl);
            if (path == null) continue;
            try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to delete image {Path}", path); }
        }
    }

    private async Task DeletePagesWithImages(IEnumerable<NotebookPage> pages)
    {
        foreach (var page in pages) DeletePageImages(page);
    }

    private static async Task<string> ComputeSha256HexAsync(string filePath)
    {
        using var sha = SHA256.Create();
        using var stream = System.IO.File.OpenRead(filePath);
        var hash = await sha.ComputeHashAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private async Task<string?> ImportArchivedMediaAsync(
        ZipArchive archive, string archivePath, List<string> importedFiles,
        Dictionary<string, string> archivePathToUrl)
    {
        var normalizedPath = archivePath.Replace('\\', '/');

        // Dedup within the same archive only (same image referenced by multiple elements)
        if (archivePathToUrl.TryGetValue(normalizedPath, out var cachedUrl))
            return cachedUrl;

        var entry = archive.GetEntry(normalizedPath);
        if (entry == null) return null;

        // Always create a new file — no cross-entity dedup for notebooks
        var uploadsPath = GetUploadsRootPath();
        var ext = Path.GetExtension(normalizedPath);
        var finalName = $"nb_{Guid.NewGuid():N}{ext}";
        var finalPath = Path.Combine(uploadsPath, finalName);

        using (var entryStream = entry.Open())
        using (var fileStream = System.IO.File.Create(finalPath))
        {
            await entryStream.CopyToAsync(fileStream);
        }

        importedFiles.Add(finalPath);
        var url = $"/uploads/{finalName}";
        archivePathToUrl[normalizedPath] = url;
        return url;
    }
}
