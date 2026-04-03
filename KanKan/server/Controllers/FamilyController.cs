using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.IO.Compression;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Family;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/family")]
public class FamilyController : ControllerBase
{
    private sealed class ArchivedMediaImportCache
    {
        public Dictionary<string, string> HashToUrl { get; } = new(StringComparer.OrdinalIgnoreCase);
        public bool ExistingUploadsIndexed { get; set; }
    }

    private readonly IFamilyTreeRepository _treeRepo;
    private readonly IFamilyPersonRepository _personRepo;
    private readonly IFamilyRelationshipRepository _relRepo;
    private readonly IFamilyTreeVisibilityRepository _visibilityRepo;
    private readonly IFamilySectionRepository _sectionRepo;
    private readonly IFamilyPageRepository _pageRepo;
    private readonly INotebookRepository _nbRepo;
    private readonly INotebookVisibilityRepository _nbVisRepo;
    private readonly IUserRepository _userRepo;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<FamilyController> _logger;
    private static readonly JsonSerializerOptions ArchiveJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public FamilyController(
        IFamilyTreeRepository treeRepo,
        IFamilyPersonRepository personRepo,
        IFamilyRelationshipRepository relRepo,
        IFamilyTreeVisibilityRepository visibilityRepo,
        IFamilySectionRepository sectionRepo,
        IFamilyPageRepository pageRepo,
        INotebookRepository nbRepo,
        INotebookVisibilityRepository nbVisRepo,
        IUserRepository userRepo,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ILogger<FamilyController> logger)
    {
        _treeRepo = treeRepo;
        _personRepo = personRepo;
        _relRepo = relRepo;
        _visibilityRepo = visibilityRepo;
        _sectionRepo = sectionRepo;
        _pageRepo = pageRepo;
        _nbRepo = nbRepo;
        _nbVisRepo = nbVisRepo;
        _userRepo = userRepo;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    // ── GET  /api/family ────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> ListTrees()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        var visibleDomains = FamilyAccessPolicy.GetVisibleDomains(_configuration, user);

        var trees = new List<FamilyTree>();
        foreach (var domain in visibleDomains)
        {
            trees.AddRange(await _treeRepo.GetByDomainAsync(domain));
        }

        var explicitVisibilities = await GetExplicitVisibilitiesAsync(user);
        foreach (var visibility in explicitVisibilities)
        {
            if (trees.Any(tree => string.Equals(tree.Id, visibility.TreeId, StringComparison.Ordinal)))
            {
                continue;
            }

            var tree = await _treeRepo.GetByIdAsync(visibility.TreeId);
            if (tree == null || !FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility))
            {
                continue;
            }

            trees.Add(tree);
        }

        if (trees.Count == 0) return Forbid();

        return Ok(trees
            .GroupBy(t => t.Id, StringComparer.Ordinal)
            .Select(group => group.First())
            .OrderByDescending(t => t.UpdatedAt)
            .Select(tree => ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree))));
    }

    // ── POST /api/family ────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateTree([FromBody] CreateFamilyTreeRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        var targetDomain = FamilyAccessPolicy.NormalizeDomain(string.IsNullOrWhiteSpace(req.Domain)
            ? FamilyAccessPolicy.ResolveDomain(user)
            : req.Domain);
        if (!FamilyAccessPolicy.CanEditTreeDomain(_configuration, user, targetDomain)) return Forbid();

        var tree = new FamilyTree
        {
            Id = $"ftree_{Guid.NewGuid():N}",
            Name = req.Name,
            Surname = req.Surname,
            OwnerId = user.Id,
            Domain = targetDomain,
            RootGeneration = req.RootGeneration,
            ZibeiPoem = req.ZibeiPoem ?? new List<string>()
        };

        await _treeRepo.CreateAsync(tree);
        return Ok(ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree)));
    }

    // ── GET  /api/family/{treeId} ───────────────────────────────────────────
    [HttpGet("{treeId}")]
    public async Task<IActionResult> GetTree(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var persons = await _personRepo.GetByTreeIdAsync(treeId);
        var rels = await _relRepo.GetByTreeIdAsync(treeId);

        return Ok(new FullFamilyTreeResponse
        {
            Tree = ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree)),
            Persons = persons.Select(ToPersonResponse).ToList(),
            Relationships = rels.Select(ToRelResponse).ToList()
        });
    }

    // ── PUT  /api/family/{treeId} ───────────────────────────────────────────
    [HttpPut("{treeId}")]
    public async Task<IActionResult> UpdateTree(string treeId, [FromBody] UpdateFamilyTreeRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanManageTree(_configuration, user, tree)) return Forbid();

        if (req.Name != null) tree.Name = req.Name;
        if (req.Surname != null) tree.Surname = req.Surname;
        if (req.RootGeneration.HasValue) tree.RootGeneration = req.RootGeneration.Value;
        if (req.ZibeiPoem != null) tree.ZibeiPoem = req.ZibeiPoem;

        await _treeRepo.UpdateAsync(tree);
        return Ok(ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree)));
    }

    // ── DELETE /api/family/{treeId} ─────────────────────────────────────────
    [HttpDelete("{treeId}")]
    public async Task<IActionResult> DeleteTree(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanManageTree(_configuration, user, tree)) return Forbid();

        await _personRepo.ClearLinkedTreeReferencesAsync(treeId);
        await _pageRepo.DeleteByTreeIdAsync(treeId);
        await _sectionRepo.DeleteByTreeIdAsync(treeId);
        await _personRepo.DeleteByTreeIdAsync(treeId);
        await _relRepo.DeleteByTreeIdAsync(treeId);
        await _visibilityRepo.DeleteByTreeIdAsync(treeId);
        await _treeRepo.DeleteAsync(treeId);
        return Ok(new { message = "Tree deleted" });
    }

    [HttpGet("{treeId}/visibility")]
    public async Task<IActionResult> GetTreeVisibility(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();

        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        return Ok(ToVisibilityResponse(visibility, treeId));
    }

    [HttpPut("{treeId}/visibility")]
    public async Task<IActionResult> UpdateTreeVisibility(string treeId, [FromBody] UpdateFamilyTreeVisibilityRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();

        var existingVisibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanManageTree(_configuration, user, tree)) return Forbid();

        var visibility = new FamilyTreeVisibility
        {
            TreeId = treeId,
            UserViewers = NormalizeVisibilityEmails(req.UserViewers),
            UserEditors = NormalizeVisibilityEmails(req.UserEditors),
            DomainViewers = NormalizeDomains(req.DomainViewers),
            DomainEditors = NormalizeDomains(req.DomainEditors),
        };

        visibility.UserViewers = visibility.UserViewers
            .Where(email => !visibility.UserEditors.Contains(email, StringComparer.Ordinal))
            .ToList();
        visibility.DomainViewers = visibility.DomainViewers
            .Where(domain => !visibility.DomainEditors.Contains(domain, StringComparer.OrdinalIgnoreCase))
            .ToList();

        await _visibilityRepo.UpsertAsync(visibility);

        // Sync notebook visibility if tree has a linked notebook
        if (!string.IsNullOrEmpty(tree.NotebookId))
        {
            await _nbVisRepo.UpsertAsync(new NotebookVisibility
            {
                NotebookId = tree.NotebookId,
                UserViewers = visibility.UserViewers,
                UserEditors = visibility.UserEditors,
                DomainViewers = visibility.DomainViewers,
                DomainEditors = visibility.DomainEditors,
            });
        }

        return Ok(ToVisibilityResponse(visibility, treeId));
    }

    // ── POST /api/family/{treeId}/persons ───────────────────────────────────
    [HttpPost("{treeId}/persons")]
    public async Task<IActionResult> AddPerson(string treeId, [FromBody] UpsertFamilyPersonRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var personId = $"fperson_{Guid.NewGuid():N}";
        var linkValidation = await ValidateLinkedPersonAsync(user, treeId, req.LinkedTreeId, req.LinkedPersonId, req.ClearLinkedPerson == true, personId);
        if (linkValidation != null) return linkValidation;
        var linkSnapshot = await BuildLinkedPersonSnapshotAsync(req.LinkedTreeId, req.LinkedPersonId, req.ClearLinkedPerson == true);

        var person = new FamilyPerson
        {
            Id = personId,
            TreeId = treeId,
            Domain = tree.Domain,
            LinkedTreeId = req.ClearLinkedPerson == true ? null : req.LinkedTreeId,
            LinkedPersonId = req.ClearLinkedPerson == true ? null : req.LinkedPersonId,
            LinkedTreeName = linkSnapshot.LinkedTreeName,
            LinkedPersonName = linkSnapshot.LinkedPersonName,
            Name = req.Name ?? string.Empty,
            Gender = req.Gender ?? "male",
            Generation = req.Generation ?? tree.RootGeneration,
            Aliases = req.Aliases ?? new List<string>(),
            BirthDate = req.BirthDate == null ? null : new FamilyDate { Year = req.BirthDate.Year, Month = req.BirthDate.Month, Day = req.BirthDate.Day, CalendarType = req.BirthDate.CalendarType, IsLeapMonth = req.BirthDate.IsLeapMonth },
            DeathDate = req.DeathDate == null ? null : new FamilyDate { Year = req.DeathDate.Year, Month = req.DeathDate.Month, Day = req.DeathDate.Day, CalendarType = req.DeathDate.CalendarType, IsLeapMonth = req.DeathDate.IsLeapMonth },
            BirthPlace = req.BirthPlace,
            DeathPlace = req.DeathPlace,
            IsAlive = req.IsAlive,
            AvatarUrl = req.AvatarUrl,
            Photos = req.Photos?.Select(p => new FamilyPhoto { Id = p.Id, Url = p.Url, Caption = p.Caption, Year = p.Year }).ToList() ?? new(),
            Occupation = req.Occupation,
            Education = req.Education,
            Biography = req.Biography,
            BriefNote = req.BriefNote,
            Experiences = req.Experiences?.Select(e => new FamilyExperience { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList() ?? new()
        };

        await _personRepo.CreateAsync(person);
        await SyncMutualLinkedPersonAsync(person, null, null);
        return Ok(ToPersonResponse(person));
    }

    // ── PUT  /api/family/{treeId}/persons/{personId} ────────────────────────
    [HttpPut("{treeId}/persons/{personId}")]
    public async Task<IActionResult> UpdatePerson(string treeId, string personId, [FromBody] UpsertFamilyPersonRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var person = await _personRepo.GetByIdAsync(personId);
        if (person == null || person.TreeId != treeId) return NotFound();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var previousLinkedTreeId = person.LinkedTreeId;
        var previousLinkedPersonId = person.LinkedPersonId;

        var shouldValidateLink = req.ClearLinkedPerson == true || req.LinkedTreeId != null || req.LinkedPersonId != null;
        if (shouldValidateLink)
        {
            var nextLinkedTreeId = req.ClearLinkedPerson == true ? null : req.LinkedTreeId ?? person.LinkedTreeId;
            var nextLinkedPersonId = req.ClearLinkedPerson == true ? null : req.LinkedPersonId ?? person.LinkedPersonId;
            var linkValidation = await ValidateLinkedPersonAsync(user, treeId, nextLinkedTreeId, nextLinkedPersonId, req.ClearLinkedPerson == true, personId);
            if (linkValidation != null) return linkValidation;
        }

        var snapshotLinkedTreeId = req.ClearLinkedPerson == true ? null : req.LinkedTreeId ?? person.LinkedTreeId;
        var snapshotLinkedPersonId = req.ClearLinkedPerson == true ? null : req.LinkedPersonId ?? person.LinkedPersonId;
        var linkSnapshot = await BuildLinkedPersonSnapshotAsync(snapshotLinkedTreeId, snapshotLinkedPersonId, req.ClearLinkedPerson == true);

        if (req.Name != null) person.Name = req.Name;
        if (req.Gender != null) person.Gender = req.Gender;
        if (req.Generation.HasValue) person.Generation = req.Generation.Value;
        if (req.Aliases != null) person.Aliases = req.Aliases;
        if (req.ClearLinkedPerson == true)
        {
            person.LinkedTreeId = null;
            person.LinkedPersonId = null;
            person.LinkedTreeName = null;
            person.LinkedPersonName = null;
        }
        else
        {
            if (req.LinkedTreeId != null) person.LinkedTreeId = req.LinkedTreeId;
            if (req.LinkedPersonId != null) person.LinkedPersonId = req.LinkedPersonId;
            person.LinkedTreeName = linkSnapshot.LinkedTreeName;
            person.LinkedPersonName = linkSnapshot.LinkedPersonName;
        }
        if (req.ClearBirthDate == true) person.BirthDate = null;
        if (req.ClearDeathDate == true) person.DeathDate = null;
        if (req.BirthDate != null) person.BirthDate = new FamilyDate { Year = req.BirthDate.Year, Month = req.BirthDate.Month, Day = req.BirthDate.Day, CalendarType = req.BirthDate.CalendarType, IsLeapMonth = req.BirthDate.IsLeapMonth };
        if (req.DeathDate != null) person.DeathDate = new FamilyDate { Year = req.DeathDate.Year, Month = req.DeathDate.Month, Day = req.DeathDate.Day, CalendarType = req.DeathDate.CalendarType, IsLeapMonth = req.DeathDate.IsLeapMonth };
        if (req.BirthPlace != null) person.BirthPlace = req.BirthPlace;
        if (req.DeathPlace != null) person.DeathPlace = req.DeathPlace;
        if (req.IsAlive.HasValue) person.IsAlive = req.IsAlive;
        if (req.AvatarUrl != null) person.AvatarUrl = req.AvatarUrl;
        if (req.Photos != null) person.Photos = req.Photos.Select(p => new FamilyPhoto { Id = p.Id, Url = p.Url, Caption = p.Caption, Year = p.Year }).ToList();
        if (req.Occupation != null) person.Occupation = req.Occupation;
        if (req.Education != null) person.Education = req.Education;
        if (req.Biography != null) person.Biography = req.Biography;
        if (req.BriefNote != null) person.BriefNote = req.BriefNote;
        if (req.Experiences != null) person.Experiences = req.Experiences.Select(e => new FamilyExperience { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList();

        await _personRepo.UpdateAsync(person);
        await SyncMutualLinkedPersonAsync(person, previousLinkedTreeId, previousLinkedPersonId);
        return Ok(ToPersonResponse(person));
    }

    // ── DELETE /api/family/{treeId}/persons/{personId} ──────────────────────
    [HttpDelete("{treeId}/persons/{personId}")]
    public async Task<IActionResult> DeletePerson(string treeId, string personId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var person = await _personRepo.GetByIdAsync(personId);
        if (person == null || person.TreeId != treeId) return NotFound();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        await ClearReverseLinkedPersonAsync(person, person.LinkedTreeId, person.LinkedPersonId);
        await _relRepo.DeleteByPersonIdAsync(personId);
        await _personRepo.DeleteAsync(personId);
        return Ok(new { message = "Person deleted" });
    }

    // ── POST /api/family/{treeId}/relationships ─────────────────────────────
    [HttpPost("{treeId}/relationships")]
    public async Task<IActionResult> AddRelationship(string treeId, [FromBody] CreateFamilyRelationshipRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var rel = new FamilyRelationship
        {
            Id = $"frel_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = tree.Domain,
            Type = req.Type,
            FromId = req.FromId,
            ToId = req.ToId,
            ParentRole = NormalizeOptionalString(req.ParentRole),
            ChildStatus = NormalizeOptionalString(req.ChildStatus),
            LineageType = NormalizeOptionalString(req.LineageType),
            DisplayTag = NormalizeOptionalString(req.DisplayTag),
            SourceParentId = NormalizeOptionalString(req.SourceParentId),
            SourceChildRank = req.SourceChildRank.HasValue && req.SourceChildRank.Value > 0 ? req.SourceChildRank.Value : null,
            SortOrder = req.SortOrder,
            UnionType = req.UnionType,
            StartYear = req.StartYear,
            EndYear = req.EndYear,
            Notes = req.Notes
        };

        await _relRepo.CreateAsync(rel);
        return Ok(ToRelResponse(rel));
    }

    // ── PUT  /api/family/{treeId}/relationships/{relId} ─────────────────────
    [HttpPut("{treeId}/relationships/{relId}")]
    public async Task<IActionResult> UpdateRelationship(string treeId, string relId, [FromBody] UpdateFamilyRelationshipRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var rel = await _relRepo.GetByIdAsync(relId);
        if (rel == null || rel.TreeId != treeId) return NotFound();
        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        if (req.ParentRole != null) rel.ParentRole = NormalizeOptionalString(req.ParentRole);
        if (req.ChildStatus != null) rel.ChildStatus = NormalizeOptionalString(req.ChildStatus);
        if (req.LineageType != null) rel.LineageType = NormalizeOptionalString(req.LineageType);
        if (req.DisplayTag != null) rel.DisplayTag = NormalizeOptionalString(req.DisplayTag);
        if (req.SourceParentId != null) rel.SourceParentId = NormalizeOptionalString(req.SourceParentId);
        if (req.SourceChildRank.HasValue) rel.SourceChildRank = req.SourceChildRank.Value > 0 ? req.SourceChildRank.Value : null;
        if (req.SortOrder.HasValue) rel.SortOrder = req.SortOrder.Value;
        if (req.Notes != null) rel.Notes = req.Notes;

        await _relRepo.UpdateAsync(rel);
        return Ok(ToRelResponse(rel));
    }

    // ── DELETE /api/family/{treeId}/relationships/{relId} ───────────────────
    [HttpDelete("{treeId}/relationships/{relId}")]
    public async Task<IActionResult> DeleteRelationship(string treeId, string relId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var rel = await _relRepo.GetByIdAsync(relId);
        if (rel == null || rel.TreeId != treeId) return NotFound();
        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        await _relRepo.DeleteAsync(relId);
        return Ok(new { message = "Relationship deleted" });
    }

    // ── POST /api/family/import-archive ────────────────────────────────────
    [HttpPost("import-archive")]
    [RequestSizeLimit(300 * 1024 * 1024)]
    public async Task<IActionResult> ImportTreeArchive([FromForm] IFormFile file, [FromForm] string? name, [FromForm] string? domain)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No archive file provided." });
        }

        FamilyTreeArchiveResponse? manifest;

        try
        {
            await using var stream = file.OpenReadStream();
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);
            var manifestEntry = archive.GetEntry("tree.json");
            if (manifestEntry == null)
            {
                return BadRequest(new { message = "Archive is missing tree.json." });
            }

            await using var manifestStream = manifestEntry.Open();
            manifest = await JsonSerializer.DeserializeAsync<FamilyTreeArchiveResponse>(manifestStream, ArchiveJsonOptions);
        }
        catch (InvalidDataException)
        {
            return BadRequest(new { message = "Archive is not a valid zip file." });
        }
        catch (JsonException)
        {
            return BadRequest(new { message = "Archive manifest is invalid." });
        }

        if (manifest == null || manifest.Tree == null)
        {
            return BadRequest(new { message = "Archive manifest is incomplete." });
        }

        var targetDomain = FamilyAccessPolicy.NormalizeDomain(string.IsNullOrWhiteSpace(domain)
            ? manifest.Tree.Domain
            : domain);
        if (string.IsNullOrWhiteSpace(targetDomain))
        {
            targetDomain = FamilyAccessPolicy.ResolveDomain(user);
        }

        if (!FamilyAccessPolicy.CanEditTreeDomain(_configuration, user, targetDomain)) return Forbid();

        var treeName = string.IsNullOrWhiteSpace(name) ? manifest.Tree.Name : name.Trim();
        if (string.IsNullOrWhiteSpace(treeName))
        {
            return BadRequest(new { message = "Tree name is required." });
        }

        var tree = new FamilyTree
        {
            Id = $"ftree_{Guid.NewGuid():N}",
            Name = treeName,
            Surname = manifest.Tree.Surname,
            OwnerId = user.Id,
            Domain = targetDomain,
            RootGeneration = manifest.Tree.RootGeneration > 0 ? manifest.Tree.RootGeneration : 1,
            ZibeiPoem = manifest.Tree.ZibeiPoem ?? new List<string>()
        };

        var importedFiles = new List<string>();
        var mediaImportCache = new ArchivedMediaImportCache();

        try
        {
            await _treeRepo.CreateAsync(tree);

            await using var stream = file.OpenReadStream();
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);

            var sourceTreeId = manifest.Tree.SourceTreeId;
            var archivedPersons = manifest.Persons ?? new List<FamilyArchivedPersonDto>();
            var personIdMap = archivedPersons.ToDictionary(person => person.Id, _ => $"fperson_{Guid.NewGuid():N}", StringComparer.Ordinal);

            foreach (var archivedPerson in archivedPersons)
            {
                var linkedTreeId = archivedPerson.LinkedTreeId;
                var linkedPersonId = archivedPerson.LinkedPersonId;

                if (string.Equals(linkedTreeId, sourceTreeId, StringComparison.Ordinal))
                {
                    linkedTreeId = tree.Id;
                    linkedPersonId = !string.IsNullOrWhiteSpace(archivedPerson.LinkedPersonId)
                        && personIdMap.TryGetValue(archivedPerson.LinkedPersonId, out var mappedLinkedPersonId)
                        ? mappedLinkedPersonId
                        : null;
                }

                var importedPerson = new FamilyPerson
                {
                    Id = personIdMap[archivedPerson.Id],
                    TreeId = tree.Id,
                    Domain = tree.Domain,
                    LinkedTreeId = linkedTreeId,
                    LinkedPersonId = linkedPersonId,
                    LinkedTreeName = string.Equals(archivedPerson.LinkedTreeId, sourceTreeId, StringComparison.Ordinal)
                        ? tree.Name
                        : NormalizeOptionalString(archivedPerson.LinkedTreeName),
                    LinkedPersonName = string.Equals(archivedPerson.LinkedTreeId, sourceTreeId, StringComparison.Ordinal)
                        && !string.IsNullOrWhiteSpace(archivedPerson.LinkedPersonId)
                        && personIdMap.TryGetValue(archivedPerson.LinkedPersonId, out _)
                        ? NormalizeOptionalString(archivedPersons.FirstOrDefault(candidate => string.Equals(candidate.Id, archivedPerson.LinkedPersonId, StringComparison.Ordinal))?.Name)
                        : NormalizeOptionalString(archivedPerson.LinkedPersonName),
                    Name = archivedPerson.Name,
                    Aliases = archivedPerson.Aliases ?? new List<string>(),
                    Gender = NormalizeGender(archivedPerson.Gender, "male"),
                    Generation = archivedPerson.Generation > 0 ? archivedPerson.Generation : tree.RootGeneration,
                    BirthDate = ToEntityDate(archivedPerson.BirthDate),
                    DeathDate = ToEntityDate(archivedPerson.DeathDate),
                    BirthPlace = NormalizeOptionalString(archivedPerson.BirthPlace),
                    DeathPlace = NormalizeOptionalString(archivedPerson.DeathPlace),
                    IsAlive = archivedPerson.IsAlive,
                    AvatarUrl = await ImportArchivedMediaAsync(archive, archivedPerson.AvatarArchivePath, archivedPerson.AvatarUrl, importedFiles, mediaImportCache),
                    Photos = await ImportArchivedPhotosAsync(archive, archivedPerson.Photos, importedFiles, mediaImportCache),
                    Occupation = NormalizeOptionalString(archivedPerson.Occupation),
                    Education = NormalizeOptionalString(archivedPerson.Education),
                    Biography = NormalizeOptionalString(archivedPerson.Biography),
                    BriefNote = NormalizeOptionalString(archivedPerson.BriefNote),
                    Experiences = (archivedPerson.Experiences ?? new List<FamilyExperienceDto>())
                        .Select(e => new FamilyExperience
                        {
                            Id = string.IsNullOrWhiteSpace(e.Id) ? $"fexp_{Guid.NewGuid():N}" : e.Id,
                            Type = e.Type,
                            Title = e.Title,
                            Description = NormalizeOptionalString(e.Description),
                            StartYear = e.StartYear,
                            EndYear = e.EndYear
                        })
                        .ToList()
                };

                await _personRepo.CreateAsync(importedPerson);
            }

            var importedRelationships = (manifest.Relationships ?? new List<FamilyRelationshipResponse>())
                .Where(rel => personIdMap.ContainsKey(rel.FromId) && personIdMap.ContainsKey(rel.ToId))
                .Select(rel => new FamilyRelationship
                {
                    Id = $"frel_{Guid.NewGuid():N}",
                    TreeId = tree.Id,
                    Domain = tree.Domain,
                    Type = rel.Type,
                    FromId = personIdMap[rel.FromId],
                    ToId = personIdMap[rel.ToId],
                    ParentRole = NormalizeOptionalString(rel.ParentRole),
                    ChildStatus = NormalizeOptionalString(rel.ChildStatus),
                    LineageType = NormalizeOptionalString(rel.LineageType),
                    DisplayTag = NormalizeOptionalString(rel.DisplayTag),
                    SourceParentId = !string.IsNullOrWhiteSpace(rel.SourceParentId) && personIdMap.TryGetValue(rel.SourceParentId, out var mappedSourceParentId)
                        ? mappedSourceParentId
                        : null,
                    SourceChildRank = rel.SourceChildRank,
                    SortOrder = rel.SortOrder,
                    UnionType = NormalizeOptionalString(rel.UnionType),
                    StartYear = rel.StartYear,
                    EndYear = rel.EndYear,
                    Notes = NormalizeOptionalString(rel.Notes)
                })
                .ToList();

            await _relRepo.InsertManyAsync(importedRelationships);

            if (manifest.Visibility != null)
            {
                var visibility = new FamilyTreeVisibility
                {
                    TreeId = tree.Id,
                    UserViewers = NormalizeVisibilityEmails(manifest.Visibility.UserViewers),
                    UserEditors = NormalizeVisibilityEmails(manifest.Visibility.UserEditors),
                    DomainViewers = NormalizeDomains(manifest.Visibility.DomainViewers),
                    DomainEditors = NormalizeDomains(manifest.Visibility.DomainEditors),
                };

                visibility.UserViewers = visibility.UserViewers
                    .Where(email => !visibility.UserEditors.Contains(email, StringComparer.Ordinal))
                    .ToList();
                visibility.DomainViewers = visibility.DomainViewers
                    .Where(value => !visibility.DomainEditors.Contains(value, StringComparer.OrdinalIgnoreCase))
                    .ToList();

                await _visibilityRepo.UpsertAsync(visibility);
            }

            return Ok(ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to import family archive for user {UserId}", user.Id);
            await CleanupImportedTreeAsync(tree.Id, importedFiles);
            return StatusCode(500, new { message = "Failed to import family archive." });
        }
    }

    // ── POST /api/family/{treeId}/import ────────────────────────────────────
    [HttpPost("{treeId}/import")]
    public async Task<IActionResult> ImportTree(string treeId, [FromBody] NestedPersonImport root)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var persons = new List<FamilyPerson>();
        var rels = new List<FamilyRelationship>();

        WalkImport(root, null, tree, persons, rels, tree.RootGeneration, 0);

        foreach (var p in persons) await _personRepo.CreateAsync(p);
        await _relRepo.InsertManyAsync(rels);

        return Ok(new { personsAdded = persons.Count, relationshipsAdded = rels.Count });
    }

    // ── GET /api/family/{treeId}/export-archive ─────────────────────────────
    [HttpGet("{treeId}/export-archive")]
    public async Task<IActionResult> ExportTreeArchive(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var canManageTree = FamilyAccessPolicy.CanManageTree(_configuration, user, tree);
        var persons = await _personRepo.GetByTreeIdAsync(treeId);
        var rels = await _relRepo.GetByTreeIdAsync(treeId);

        await using var memory = new MemoryStream();

        using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, leaveOpen: true))
        {
            var archiveManifest = await CreateArchiveManifestAsync(tree, canManageTree ? visibility : null, persons, rels, archive);
            var manifestEntry = archive.CreateEntry("tree.json", CompressionLevel.SmallestSize);
            await using var manifestStream = manifestEntry.Open();
            await JsonSerializer.SerializeAsync(manifestStream, archiveManifest, ArchiveJsonOptions);
        }

        return File(memory.ToArray(), "application/zip", BuildArchiveFileName(tree.Name));
    }

    // ── GET /api/family/{treeId}/export ─────────────────────────────────────
    [HttpGet("{treeId}/export")]
    public async Task<IActionResult> ExportTree(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var persons = await _personRepo.GetByTreeIdAsync(treeId);
        var rels = await _relRepo.GetByTreeIdAsync(treeId);

        var export = new FullFamilyTreeResponse
        {
            Tree = ToTreeResponse(tree, FamilyAccessPolicy.CanManageTree(_configuration, user, tree)),
            Persons = persons.Select(ToPersonResponse).ToList(),
            Relationships = rels.Select(ToRelResponse).ToList()
        };

        return Ok(export);
    }

    // ── Tree Notebook Bridge ───────────────────────────────────────────────

    [HttpGet("{treeId}/notebook")]
    public async Task<IActionResult> GetTreeNotebook(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        if (string.IsNullOrEmpty(tree.NotebookId))
            return Ok(new { notebookId = (string?)null });

        return Ok(new { notebookId = tree.NotebookId });
    }

    [HttpPost("{treeId}/notebook")]
    public async Task<IActionResult> GetOrCreateTreeNotebook(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var treeVisibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, treeVisibility)) return Forbid();

        if (!string.IsNullOrEmpty(tree.NotebookId))
        {
            var existing = await _nbRepo.GetByIdAsync(tree.NotebookId);
            if (existing != null)
                return Ok(new { notebookId = tree.NotebookId });
        }

        // Create a new notebook for this tree
        var notebook = new Notebook
        {
            Id = $"nb_{Guid.NewGuid():N}",
            Name = $"{tree.Name} 谱志",
            OwnerId = tree.OwnerId,
            Domain = tree.Domain,
        };
        await _nbRepo.CreateAsync(notebook);

        // Copy tree visibility to notebook so shared users can access it
        if (treeVisibility != null)
        {
            await _nbVisRepo.UpsertAsync(new NotebookVisibility
            {
                NotebookId = notebook.Id,
                UserViewers = treeVisibility.UserViewers ?? new(),
                UserEditors = treeVisibility.UserEditors ?? new(),
                DomainViewers = treeVisibility.DomainViewers ?? new(),
                DomainEditors = treeVisibility.DomainEditors ?? new(),
            });
        }

        tree.NotebookId = notebook.Id;
        await _treeRepo.UpdateAsync(tree);

        return Ok(new { notebookId = notebook.Id });
    }

    // ── Section Endpoints ──────────────────────────────────────────────────

    [HttpGet("{treeId}/sections")]
    public async Task<IActionResult> ListSections(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var sections = await _sectionRepo.GetByTreeIdAsync(treeId);
        return Ok(sections.Select(ToSectionResponse).ToList());
    }

    [HttpPost("{treeId}/sections")]
    public async Task<IActionResult> CreateSection(string treeId, [FromBody] CreateFamilySectionRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var existing = await _sectionRepo.GetByTreeIdAsync(treeId);
        var sortOrder = req.SortOrder ?? (existing.Count > 0 ? existing.Max(s => s.SortOrder) + 1 : 1);

        var section = new FamilySection
        {
            Id = $"fsec_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = tree.Domain,
            Name = req.Name,
            SortOrder = sortOrder,
        };
        await _sectionRepo.CreateAsync(section);

        // Auto-create one blank page in the new section
        await _pageRepo.CreateAsync(new FamilyPage
        {
            Id = $"fpage_{Guid.NewGuid():N}",
            SectionId = section.Id,
            TreeId = treeId,
            Domain = tree.Domain,
            PageNumber = 1,
            Elements = new List<PageElement>(),
        });

        return Ok(ToSectionResponse(section));
    }

    [HttpPut("{treeId}/sections/{sectionId}")]
    public async Task<IActionResult> UpdateSection(string treeId, string sectionId, [FromBody] UpdateFamilySectionRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var section = await _sectionRepo.GetByIdAsync(sectionId);
        if (section == null || section.TreeId != treeId) return NotFound();

        if (req.Name != null) section.Name = req.Name;
        if (req.SortOrder.HasValue) section.SortOrder = req.SortOrder.Value;

        await _sectionRepo.UpdateAsync(section);
        return Ok(ToSectionResponse(section));
    }

    [HttpDelete("{treeId}/sections/{sectionId}")]
    public async Task<IActionResult> DeleteSection(string treeId, string sectionId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var section = await _sectionRepo.GetByIdAsync(sectionId);
        if (section == null || section.TreeId != treeId) return NotFound();

        await _pageRepo.DeleteBySectionIdAsync(sectionId);
        await _sectionRepo.DeleteAsync(sectionId);
        return Ok(new { message = "Section deleted" });
    }

    // ── Page Endpoints ─────────────────────────────────────────────────────

    [HttpGet("{treeId}/sections/{sectionId}/pages")]
    public async Task<IActionResult> ListPages(string treeId, string sectionId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var section = await _sectionRepo.GetByIdAsync(sectionId);
        if (section == null || section.TreeId != treeId) return NotFound();

        var pages = await _pageRepo.GetBySectionIdAsync(sectionId);
        return Ok(pages.Select(p => new FamilyPageSummaryResponse
        {
            Id = p.Id,
            PageNumber = p.PageNumber,
        }).ToList());
    }

    [HttpGet("{treeId}/pages/{pageId}")]
    public async Task<IActionResult> GetPage(string treeId, string pageId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanViewTree(_configuration, user, tree, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.TreeId != treeId) return NotFound();

        return Ok(ToPageResponse(page));
    }

    [HttpPost("{treeId}/sections/{sectionId}/pages")]
    public async Task<IActionResult> CreatePage(string treeId, string sectionId, [FromBody] CreateFamilyPageRequest? req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var section = await _sectionRepo.GetByIdAsync(sectionId);
        if (section == null || section.TreeId != treeId) return NotFound();

        var existingPages = await _pageRepo.GetBySectionIdAsync(sectionId);
        var pageNumber = req?.PageNumber ?? (existingPages.Count > 0 ? existingPages.Max(p => p.PageNumber) + 1 : 1);

        var page = new FamilyPage
        {
            Id = $"fpage_{Guid.NewGuid():N}",
            SectionId = sectionId,
            TreeId = treeId,
            Domain = tree.Domain,
            PageNumber = pageNumber,
            Elements = new List<PageElement>(),
        };
        await _pageRepo.CreateAsync(page);
        return Ok(ToPageResponse(page));
    }

    [HttpPut("{treeId}/pages/{pageId}")]
    public async Task<IActionResult> UpdatePage(string treeId, string pageId, [FromBody] UpdateFamilyPageRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.TreeId != treeId) return NotFound();

        if (req.PageNumber.HasValue) page.PageNumber = req.PageNumber.Value;
        if (req.Elements != null)
        {
            page.Elements = req.Elements.Select(e => new PageElement
            {
                Id = string.IsNullOrEmpty(e.Id) ? $"pelem_{Guid.NewGuid():N}" : e.Id,
                Type = e.Type,
                X = e.X,
                Y = e.Y,
                Width = e.Width,
                Height = e.Height,
                Text = e.Text,
                FontSize = e.FontSize,
                TextAlign = e.TextAlign ?? "left",
                ImageUrl = e.ImageUrl,
                ZIndex = e.ZIndex,
            }).ToList();
        }

        await _pageRepo.UpdateAsync(page);
        return Ok(ToPageResponse(page));
    }

    [HttpDelete("{treeId}/pages/{pageId}")]
    public async Task<IActionResult> DeletePage(string treeId, string pageId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        var visibility = await _visibilityRepo.GetByTreeIdAsync(treeId);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, tree, visibility)) return Forbid();

        var page = await _pageRepo.GetByIdAsync(pageId);
        if (page == null || page.TreeId != treeId) return NotFound();

        await _pageRepo.DeleteAsync(pageId);
        return Ok(new { message = "Page deleted" });
    }

    // ── Seed Sections ──────────────────────────────────────────────────────

    [HttpPost("seed-sections")]
    public async Task<IActionResult> SeedSections()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        // Only allow admins
        var adminEmails = _configuration.GetSection("AdminEmails").Get<string[]>() ?? Array.Empty<string>();
        if (!adminEmails.Contains(user.Email, StringComparer.OrdinalIgnoreCase))
            return Forbid();

        // Find first tree the user owns
        var visibleDomains = FamilyAccessPolicy.GetVisibleDomains(_configuration, user);
        FamilyTree? tree = null;
        foreach (var domain in visibleDomains)
        {
            var trees = await _treeRepo.GetByDomainAsync(domain);
            tree = trees.FirstOrDefault(t => t.OwnerId == user.Id);
            if (tree != null) break;
        }

        if (tree == null) return BadRequest(new { message = "No tree found for this user. Create a tree first." });

        // Check if sections already exist
        var existingSections = await _sectionRepo.GetByTreeIdAsync(tree.Id);
        if (existingSections.Count > 0)
            return Ok(new { message = "Sections already exist for this tree", sectionCount = existingSections.Count });

        // Create sample notebook sections with pages
        var sampleSections = new[]
        {
            ("家族历史", 0),
            ("家族照片", 1),
            ("家训家规", 2),
            ("纪念册", 3),
        };

        foreach (var (name, sortOrder) in sampleSections)
        {
            var section = new FamilySection
            {
                Id = $"fsec_{Guid.NewGuid():N}",
                TreeId = tree.Id,
                Domain = tree.Domain,
                Name = name,
                SortOrder = sortOrder,
            };
            await _sectionRepo.CreateAsync(section);

            // Create 2 sample pages per section
            for (var pageNum = 1; pageNum <= 2; pageNum++)
            {
                var page = new FamilyPage
                {
                    Id = $"fpage_{Guid.NewGuid():N}",
                    SectionId = section.Id,
                    TreeId = tree.Id,
                    Domain = tree.Domain,
                    PageNumber = pageNum,
                    Elements = new List<PageElement>
                    {
                        new()
                        {
                            Id = $"pelem_{Guid.NewGuid():N}",
                            Type = "text",
                            X = 72,
                            Y = 72,
                            Width = 500,
                            Height = 52,
                            Text = name,
                            FontSize = 28,
                            TextAlign = "left",
                            ZIndex = 1,
                        },
                        new()
                        {
                            Id = $"pelem_{Guid.NewGuid():N}",
                            Type = "text",
                            X = 72,
                            Y = 148,
                            Width = 660,
                            Height = 120,
                            Text = $"这是 {name} 的第 {pageNum} 页。\n\n点击页面空白处开始输入文字。可以拖入图片或粘贴截图。",
                            FontSize = 16,
                            TextAlign = "left",
                            ZIndex = 2,
                        },
                    },
                };
                await _pageRepo.CreateAsync(page);
            }
        }

        return Ok(new { message = "Seeded 4 notebook sections with sample pages", treeId = tree.Id });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async Task<User?> GetCurrentUserAsync()
    {
        var id = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
        return await _userRepo.GetByIdAsync(id);
    }

    private static FamilyTreeResponse ToTreeResponse(FamilyTree t, bool canManagePermissions) => new()
    {
        Id = t.Id, Name = t.Name, Surname = t.Surname, Domain = t.Domain,
        OwnerId = t.OwnerId, RootGeneration = t.RootGeneration, ZibeiPoem = t.ZibeiPoem,
        CanManagePermissions = canManagePermissions,
        CreatedAt = t.CreatedAt.ToString("o"), UpdatedAt = t.UpdatedAt.ToString("o")
    };

    private static FamilyTreeVisibilityResponse ToVisibilityResponse(FamilyTreeVisibility? visibility, string treeId) => new()
    {
        TreeId = treeId,
        UserViewers = visibility?.UserViewers ?? new List<string>(),
        UserEditors = visibility?.UserEditors ?? new List<string>(),
        DomainViewers = visibility?.DomainViewers ?? new List<string>(),
        DomainEditors = visibility?.DomainEditors ?? new List<string>(),
    };

    private static FamilyPersonResponse ToPersonResponse(FamilyPerson p) => new()
    {
        Id = p.Id, TreeId = p.TreeId, LinkedTreeId = p.LinkedTreeId, LinkedPersonId = p.LinkedPersonId, Name = p.Name, Aliases = p.Aliases,
        LinkedTreeName = p.LinkedTreeName, LinkedPersonName = p.LinkedPersonName,
        Gender = p.Gender, Generation = p.Generation,
        BirthDate = p.BirthDate == null ? null : new FamilyDateDto { Year = p.BirthDate.Year, Month = p.BirthDate.Month, Day = p.BirthDate.Day, CalendarType = p.BirthDate.CalendarType, IsLeapMonth = p.BirthDate.IsLeapMonth },
        DeathDate = p.DeathDate == null ? null : new FamilyDateDto { Year = p.DeathDate.Year, Month = p.DeathDate.Month, Day = p.DeathDate.Day, CalendarType = p.DeathDate.CalendarType, IsLeapMonth = p.DeathDate.IsLeapMonth },
        BirthPlace = p.BirthPlace, DeathPlace = p.DeathPlace, IsAlive = p.IsAlive,
        AvatarUrl = p.AvatarUrl,
        Photos = p.Photos.Select(ph => new FamilyPhotoDto { Id = ph.Id, Url = ph.Url, Caption = ph.Caption, Year = ph.Year }).ToList(),
        Occupation = p.Occupation, Education = p.Education, Biography = p.Biography, BriefNote = p.BriefNote,
        Experiences = p.Experiences.Select(e => new FamilyExperienceDto { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList()
    };

    private static FamilyRelationshipResponse ToRelResponse(FamilyRelationship r) => new()
    {
        Id = r.Id, Type = r.Type, FromId = r.FromId, ToId = r.ToId,
        ParentRole = r.ParentRole, ChildStatus = r.ChildStatus, LineageType = r.LineageType,
        DisplayTag = r.DisplayTag, SourceParentId = r.SourceParentId, SourceChildRank = r.SourceChildRank, SortOrder = r.SortOrder,
        UnionType = r.UnionType, StartYear = r.StartYear, EndYear = r.EndYear, Notes = r.Notes
    };

    private static FamilySectionResponse ToSectionResponse(FamilySection s) => new()
    {
        Id = s.Id, TreeId = s.TreeId, Name = s.Name, SortOrder = s.SortOrder,
        CreatedAt = s.CreatedAt.ToString("o"), UpdatedAt = s.UpdatedAt.ToString("o")
    };

    private static FamilyPageResponse ToPageResponse(FamilyPage p) => new()
    {
        Id = p.Id, SectionId = p.SectionId, TreeId = p.TreeId, PageNumber = p.PageNumber,
        Elements = p.Elements.Select(e => new PageElementDto
        {
            Id = e.Id, Type = e.Type, X = e.X, Y = e.Y, Width = e.Width, Height = e.Height,
            Text = e.Text, FontSize = e.FontSize, TextAlign = e.TextAlign,
            ImageUrl = e.ImageUrl, ZIndex = e.ZIndex
        }).ToList(),
        CreatedAt = p.CreatedAt.ToString("o"), UpdatedAt = p.UpdatedAt.ToString("o")
    };

    private async Task<FamilyTreeArchiveResponse> CreateArchiveManifestAsync(
        FamilyTree tree,
        FamilyTreeVisibility? visibility,
        IEnumerable<FamilyPerson> persons,
        IEnumerable<FamilyRelationship> rels,
        ZipArchive archive)
    {
        var archivedPersons = await Task.WhenAll(persons.Select(person => ToArchivedPersonResponseAsync(person, archive)));

        return new FamilyTreeArchiveResponse
        {
            FormatVersion = 1,
            ExportedAt = DateTime.UtcNow.ToString("o"),
            Tree = new FamilyTreeArchiveTreeDto
            {
                SourceTreeId = tree.Id,
                Name = tree.Name,
                Surname = tree.Surname,
                Domain = tree.Domain,
                RootGeneration = tree.RootGeneration,
                ZibeiPoem = tree.ZibeiPoem ?? new List<string>()
            },
            Visibility = visibility == null ? null : ToVisibilityResponse(visibility, tree.Id),
            Persons = archivedPersons.ToList(),
            Relationships = rels.Select(ToRelResponse).ToList()
        };
    }

    private async Task<FamilyArchivedPersonDto> ToArchivedPersonResponseAsync(FamilyPerson person, ZipArchive archive)
    {
        var archivedPhotos = await Task.WhenAll(person.Photos.Select(async photo => new FamilyArchivedPhotoDto
        {
            Id = photo.Id,
            Url = photo.Url,
            ArchivePath = await TryAddMediaFileToArchiveAsync(archive, photo.Url),
            Caption = photo.Caption,
            Year = photo.Year
        }));

        return new FamilyArchivedPersonDto
        {
            Id = person.Id,
            TreeId = person.TreeId,
            LinkedTreeId = person.LinkedTreeId,
            LinkedPersonId = person.LinkedPersonId,
            LinkedTreeName = person.LinkedTreeName,
            LinkedPersonName = person.LinkedPersonName,
            Name = person.Name,
            Aliases = person.Aliases,
            Gender = person.Gender,
            Generation = person.Generation,
            BirthDate = person.BirthDate == null ? null : new FamilyDateDto
            {
                Year = person.BirthDate.Year,
                Month = person.BirthDate.Month,
                Day = person.BirthDate.Day,
                CalendarType = person.BirthDate.CalendarType,
                IsLeapMonth = person.BirthDate.IsLeapMonth
            },
            DeathDate = person.DeathDate == null ? null : new FamilyDateDto
            {
                Year = person.DeathDate.Year,
                Month = person.DeathDate.Month,
                Day = person.DeathDate.Day,
                CalendarType = person.DeathDate.CalendarType,
                IsLeapMonth = person.DeathDate.IsLeapMonth
            },
            BirthPlace = person.BirthPlace,
            DeathPlace = person.DeathPlace,
            IsAlive = person.IsAlive,
            AvatarUrl = person.AvatarUrl,
            AvatarArchivePath = await TryAddMediaFileToArchiveAsync(archive, person.AvatarUrl),
            Photos = archivedPhotos.ToList(),
            Occupation = person.Occupation,
            Education = person.Education,
            Biography = person.Biography,
            BriefNote = person.BriefNote,
            Experiences = person.Experiences.Select(experience => new FamilyExperienceDto
            {
                Id = experience.Id,
                Type = experience.Type,
                Title = experience.Title,
                Description = experience.Description,
                StartYear = experience.StartYear,
                EndYear = experience.EndYear
            }).ToList()
        };
    }

    private Task<string?> TryAddMediaFileToArchiveAsync(ZipArchive archive, string? url)
    {
        var localFilePath = ResolveLocalUploadPath(url);
        if (localFilePath == null || !System.IO.File.Exists(localFilePath))
        {
            return Task.FromResult<string?>(null);
        }

        var extension = Path.GetExtension(localFilePath);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".bin";
        }

        var archivePath = $"photos/{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var entry = archive.CreateEntry(archivePath, CompressionLevel.SmallestSize);

        using var source = System.IO.File.OpenRead(localFilePath);
        using var destination = entry.Open();
        source.CopyTo(destination);

        return Task.FromResult<string?>(archivePath);
    }

    private string? ResolveLocalUploadPath(string? url)
    {
        var normalizedUrl = NormalizeOptionalString(url);
        if (string.IsNullOrWhiteSpace(normalizedUrl))
        {
            return null;
        }

        var trimmed = normalizedUrl.Replace('\\', '/').Trim();
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var absoluteUri))
        {
            trimmed = absoluteUri.AbsolutePath;
        }

        if (!trimmed.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase)
            && !trimmed.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var fileName = Path.GetFileName(trimmed);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        return Path.Combine(GetUploadsRootPath(), fileName);
    }

    private string GetUploadsRootPath()
    {
        var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var uploadsPath = Path.Combine(webRoot, "uploads");
        Directory.CreateDirectory(uploadsPath);
        return uploadsPath;
    }

    private async Task<string?> ImportArchivedMediaAsync(ZipArchive archive, string? archivePath, string? fallbackUrl, List<string> importedFiles, ArchivedMediaImportCache mediaImportCache)
    {
        var normalizedArchivePath = NormalizeOptionalString(archivePath)?.Replace('\\', '/');
        if (!string.IsNullOrWhiteSpace(normalizedArchivePath))
        {
            var entry = archive.GetEntry(normalizedArchivePath);
            if (entry != null)
            {
                return await SaveArchiveEntryToUploadsAsync(entry, importedFiles, mediaImportCache);
            }
        }

        var normalizedFallbackUrl = NormalizeOptionalString(fallbackUrl);
        if (string.IsNullOrWhiteSpace(normalizedFallbackUrl))
        {
            return null;
        }

        if (ResolveLocalUploadPath(normalizedFallbackUrl) != null)
        {
            return null;
        }

        return normalizedFallbackUrl;
    }

    private async Task<List<FamilyPhoto>> ImportArchivedPhotosAsync(ZipArchive archive, IEnumerable<FamilyArchivedPhotoDto>? photos, List<string> importedFiles, ArchivedMediaImportCache mediaImportCache)
    {
        var result = new List<FamilyPhoto>();

        foreach (var photo in photos ?? Array.Empty<FamilyArchivedPhotoDto>())
        {
            result.Add(new FamilyPhoto
            {
                Id = string.IsNullOrWhiteSpace(photo.Id) ? $"photo_{Guid.NewGuid():N}" : photo.Id,
                Url = await ImportArchivedMediaAsync(archive, photo.ArchivePath, photo.Url, importedFiles, mediaImportCache) ?? string.Empty,
                Caption = NormalizeOptionalString(photo.Caption),
                Year = photo.Year
            });
        }

        return result;
    }

    private async Task<string> SaveArchiveEntryToUploadsAsync(ZipArchiveEntry entry, List<string> importedFiles, ArchivedMediaImportCache mediaImportCache)
    {
        await EnsureUploadHashIndexAsync(mediaImportCache);

        await using var source = entry.Open();
        await using var bufferedContent = new MemoryStream();
        await source.CopyToAsync(bufferedContent);

        bufferedContent.Position = 0;
        var contentHash = await ComputeSha256HexAsync(bufferedContent);
        if (mediaImportCache.HashToUrl.TryGetValue(contentHash, out var existingUrl))
        {
            return existingUrl;
        }

        var extension = Path.GetExtension(entry.Name);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".bin";
        }

        var fileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var absolutePath = Path.Combine(GetUploadsRootPath(), fileName);

        await using (var destination = new FileStream(absolutePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            bufferedContent.Position = 0;
            await bufferedContent.CopyToAsync(destination);
        }

        importedFiles.Add(absolutePath);
        var uploadedUrl = $"/uploads/{fileName}";
        mediaImportCache.HashToUrl[contentHash] = uploadedUrl;
        return uploadedUrl;
    }

    private async Task EnsureUploadHashIndexAsync(ArchivedMediaImportCache mediaImportCache)
    {
        if (mediaImportCache.ExistingUploadsIndexed)
        {
            return;
        }

        foreach (var filePath in Directory.EnumerateFiles(GetUploadsRootPath()))
        {
            try
            {
                var existingHash = await ComputeFileSha256HexAsync(filePath);
                mediaImportCache.HashToUrl.TryAdd(existingHash, $"/uploads/{Path.GetFileName(filePath)}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to index uploaded media file {FilePath} for archive deduplication", filePath);
            }
        }

        mediaImportCache.ExistingUploadsIndexed = true;
    }

    private static async Task<string> ComputeFileSha256HexAsync(string filePath)
    {
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return await ComputeSha256HexAsync(stream);
    }

    private static async Task<string> ComputeSha256HexAsync(Stream stream)
    {
        using var sha256 = SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream);
        return Convert.ToHexString(hash);
    }

    private static FamilyDate? ToEntityDate(FamilyDateDto? date)
    {
        if (date == null) return null;

        return new FamilyDate
        {
            Year = date.Year,
            Month = date.Month,
            Day = date.Day,
            CalendarType = date.CalendarType,
            IsLeapMonth = date.IsLeapMonth,
        };
    }

    private async Task CleanupImportedTreeAsync(string treeId, IEnumerable<string> importedFiles)
    {
        try
        {
            await _personRepo.ClearLinkedTreeReferencesAsync(treeId);
            await _pageRepo.DeleteByTreeIdAsync(treeId);
            await _sectionRepo.DeleteByTreeIdAsync(treeId);
            await _personRepo.DeleteByTreeIdAsync(treeId);
            await _relRepo.DeleteByTreeIdAsync(treeId);
            await _visibilityRepo.DeleteByTreeIdAsync(treeId);
            await _treeRepo.DeleteAsync(treeId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to rollback imported tree {TreeId}", treeId);
        }

        foreach (var filePath in importedFiles)
        {
            try
            {
                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Delete(filePath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete imported media file {FilePath}", filePath);
            }
        }
    }

    private static string BuildArchiveFileName(string treeName)
    {
        var baseName = string.IsNullOrWhiteSpace(treeName) ? "family-tree" : treeName.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            baseName = baseName.Replace(invalid, '_');
        }

        return $"{baseName}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip";
    }

    private async Task<(string? LinkedTreeName, string? LinkedPersonName)> BuildLinkedPersonSnapshotAsync(string? linkedTreeId, string? linkedPersonId, bool clearLinkedPerson)
    {
        if (clearLinkedPerson || string.IsNullOrWhiteSpace(linkedTreeId) || string.IsNullOrWhiteSpace(linkedPersonId))
        {
            return (null, null);
        }

        var linkedTree = await _treeRepo.GetByIdAsync(linkedTreeId);
        var linkedPerson = await _personRepo.GetByIdAsync(linkedPersonId);

        return (
            NormalizeOptionalString(linkedTree?.Name),
            NormalizeOptionalString(linkedPerson?.Name));
    }

    private async Task<IActionResult?> ValidateLinkedPersonAsync(User user, string currentTreeId, string? linkedTreeId, string? linkedPersonId, bool clearLinkedPerson, string? currentPersonId = null)
    {
        if (clearLinkedPerson) return null;

        var hasLinkedTreeId = !string.IsNullOrWhiteSpace(linkedTreeId);
        var hasLinkedPersonId = !string.IsNullOrWhiteSpace(linkedPersonId);

        if (!hasLinkedTreeId && !hasLinkedPersonId) return null;
        if (!hasLinkedTreeId || !hasLinkedPersonId)
        {
            return BadRequest(new { message = "linkedTreeId and linkedPersonId must both be provided." });
        }

        if (string.Equals(currentTreeId, linkedTreeId, StringComparison.Ordinal)
            && string.Equals(currentPersonId, linkedPersonId, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "A person cannot link to itself." });
        }

        var linkedTree = await _treeRepo.GetByIdAsync(linkedTreeId!);
        if (linkedTree == null)
        {
            return BadRequest(new { message = "Linked tree was not found." });
        }
        var linkedTreeVisibility = await _visibilityRepo.GetByTreeIdAsync(linkedTreeId!);
        if (!FamilyAccessPolicy.CanEditTree(_configuration, user, linkedTree, linkedTreeVisibility))
        {
            return Forbid();
        }

        var linkedPerson = await _personRepo.GetByIdAsync(linkedPersonId!);
        if (linkedPerson == null || !string.Equals(linkedPerson.TreeId, linkedTreeId, StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Linked person was not found in the selected tree." });
        }

        var linkedPersonAlreadyPointsElsewhere =
            !string.IsNullOrWhiteSpace(linkedPerson.LinkedTreeId)
            || !string.IsNullOrWhiteSpace(linkedPerson.LinkedPersonId);

        if (linkedPersonAlreadyPointsElsewhere
            && (!string.Equals(linkedPerson.LinkedTreeId, currentTreeId, StringComparison.Ordinal)
                || !string.Equals(linkedPerson.LinkedPersonId, currentPersonId, StringComparison.Ordinal)))
        {
            return BadRequest(new { message = "The linked person is already connected to a different person." });
        }

        return null;
    }

    private async Task SyncMutualLinkedPersonAsync(FamilyPerson person, string? previousLinkedTreeId, string? previousLinkedPersonId)
    {
        await ClearReverseLinkedPersonAsync(person, previousLinkedTreeId, previousLinkedPersonId);

        if (string.IsNullOrWhiteSpace(person.LinkedTreeId) || string.IsNullOrWhiteSpace(person.LinkedPersonId))
        {
            return;
        }

        var linkedPerson = await _personRepo.GetByIdAsync(person.LinkedPersonId);
        if (linkedPerson == null || !string.Equals(linkedPerson.TreeId, person.LinkedTreeId, StringComparison.Ordinal))
        {
            return;
        }

        if (string.Equals(linkedPerson.LinkedTreeId, person.TreeId, StringComparison.Ordinal)
            && string.Equals(linkedPerson.LinkedPersonId, person.Id, StringComparison.Ordinal))
        {
            return;
        }

        linkedPerson.LinkedTreeId = person.TreeId;
        linkedPerson.LinkedPersonId = person.Id;
        await _personRepo.UpdateAsync(linkedPerson);
    }

    private async Task ClearReverseLinkedPersonAsync(FamilyPerson person, string? linkedTreeId, string? linkedPersonId)
    {
        if (string.IsNullOrWhiteSpace(linkedTreeId) || string.IsNullOrWhiteSpace(linkedPersonId))
        {
            return;
        }

        var linkedPerson = await _personRepo.GetByIdAsync(linkedPersonId);
        if (linkedPerson == null || !string.Equals(linkedPerson.TreeId, linkedTreeId, StringComparison.Ordinal))
        {
            return;
        }

        if (!string.Equals(linkedPerson.LinkedTreeId, person.TreeId, StringComparison.Ordinal)
            || !string.Equals(linkedPerson.LinkedPersonId, person.Id, StringComparison.Ordinal))
        {
            return;
        }

        linkedPerson.LinkedTreeId = null;
        linkedPerson.LinkedPersonId = null;
        await _personRepo.UpdateAsync(linkedPerson);
    }

    private static void WalkImport(
        NestedPersonImport node,
        FamilyPerson? parentPerson,
        FamilyTree tree,
        List<FamilyPerson> persons,
        List<FamilyRelationship> rels,
        int generation,
        int sortOrder)
    {
        var person = new FamilyPerson
        {
            Id = $"fperson_{Guid.NewGuid():N}",
            TreeId = tree.Id,
            Domain = tree.Domain,
            Name = node.Name,
            Gender = NormalizeGender(node.Gender, "male"),
            Generation = generation,
            BirthDate = node.BirthYear.HasValue ? new FamilyDate { Year = node.BirthYear.Value, CalendarType = "solar" } : null,
            DeathDate = node.DeathYear.HasValue ? new FamilyDate { Year = node.DeathYear.Value, CalendarType = "solar" } : null,
            IsAlive = node.DeathYear.HasValue ? false : null
        };
        persons.Add(person);

        if (parentPerson != null)
        {
            rels.Add(new FamilyRelationship
            {
                Id = $"frel_{Guid.NewGuid():N}",
                TreeId = tree.Id,
                Domain = tree.Domain,
                Type = "parent-child",
                FromId = parentPerson.Id,
                ToId = person.Id,
                ParentRole = "father",
                ChildStatus = "biological",
                SortOrder = sortOrder
            });
        }

        if (!string.IsNullOrWhiteSpace(node.Spouse))
        {
            var spouse = new FamilyPerson
            {
                Id = $"fperson_{Guid.NewGuid():N}",
                TreeId = tree.Id,
                Domain = tree.Domain,
                Name = node.Spouse,
                Gender = NormalizeGender(node.SpouseGender, "female"),
                Generation = generation
            };
            persons.Add(spouse);
            rels.Add(new FamilyRelationship
            {
                Id = $"frel_{Guid.NewGuid():N}",
                TreeId = tree.Id,
                Domain = tree.Domain,
                Type = "spouse",
                FromId = person.Id,
                ToId = spouse.Id,
                UnionType = "married"
            });
        }

        if (node.Children != null)
        {
            for (int i = 0; i < node.Children.Count; i++)
                WalkImport(node.Children[i], person, tree, persons, rels, generation + 1, i);
        }
    }

    private static string NormalizeGender(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "男" or "male" or "m" => "male",
            "女" or "female" or "f" => "female",
            "未知" or "unknown" => "unknown",
            _ => fallback
        };
    }

    private static string? NormalizeOptionalString(string? value)
    {
        if (value == null) return null;
        var trimmed = value.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private async Task<List<FamilyTreeVisibility>> GetExplicitVisibilitiesAsync(User user)
    {
        var visibilities = new List<FamilyTreeVisibility>();
        visibilities.AddRange(await _visibilityRepo.GetByEmailAsync(FamilyAccessPolicy.NormalizeEmail(user.Email)));

        var userDomain = FamilyAccessPolicy.ResolveDomain(user);
        if (!string.IsNullOrWhiteSpace(userDomain))
        {
            visibilities.AddRange(await _visibilityRepo.GetByDomainAsync(userDomain));
        }

        return visibilities
            .GroupBy(visibility => visibility.TreeId, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();
    }

    private static List<string> NormalizeVisibilityEmails(IEnumerable<string>? values)
    {
        return (values ?? Array.Empty<string>())
            .Select(FamilyAccessPolicy.NormalizeVisibilityEmail)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static List<string> NormalizeDomains(IEnumerable<string>? values)
    {
        return (values ?? Array.Empty<string>())
            .Select(FamilyAccessPolicy.NormalizeDomain)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
