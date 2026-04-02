using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
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
    private readonly IFamilyTreeRepository _treeRepo;
    private readonly IFamilyPersonRepository _personRepo;
    private readonly IFamilyRelationshipRepository _relRepo;
    private readonly IFamilyTreeVisibilityRepository _visibilityRepo;
    private readonly IUserRepository _userRepo;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FamilyController> _logger;

    public FamilyController(
        IFamilyTreeRepository treeRepo,
        IFamilyPersonRepository personRepo,
        IFamilyRelationshipRepository relRepo,
        IFamilyTreeVisibilityRepository visibilityRepo,
        IUserRepository userRepo,
        IConfiguration configuration,
        ILogger<FamilyController> logger)
    {
        _treeRepo = treeRepo;
        _personRepo = personRepo;
        _relRepo = relRepo;
        _visibilityRepo = visibilityRepo;
        _userRepo = userRepo;
        _configuration = configuration;
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

        var person = new FamilyPerson
        {
            Id = personId,
            TreeId = treeId,
            Domain = tree.Domain,
            LinkedTreeId = req.ClearLinkedPerson == true ? null : req.LinkedTreeId,
            LinkedPersonId = req.ClearLinkedPerson == true ? null : req.LinkedPersonId,
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

        if (req.Name != null) person.Name = req.Name;
        if (req.Gender != null) person.Gender = req.Gender;
        if (req.Generation.HasValue) person.Generation = req.Generation.Value;
        if (req.Aliases != null) person.Aliases = req.Aliases;
        if (req.ClearLinkedPerson == true)
        {
            person.LinkedTreeId = null;
            person.LinkedPersonId = null;
        }
        else
        {
            if (req.LinkedTreeId != null) person.LinkedTreeId = req.LinkedTreeId;
            if (req.LinkedPersonId != null) person.LinkedPersonId = req.LinkedPersonId;
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
