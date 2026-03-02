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
    private readonly IUserRepository _userRepo;
    private readonly ILogger<FamilyController> _logger;

    public FamilyController(
        IFamilyTreeRepository treeRepo,
        IFamilyPersonRepository personRepo,
        IFamilyRelationshipRepository relRepo,
        IUserRepository userRepo,
        ILogger<FamilyController> logger)
    {
        _treeRepo = treeRepo;
        _personRepo = personRepo;
        _relRepo = relRepo;
        _userRepo = userRepo;
        _logger = logger;
    }

    // ── GET  /api/family ────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> ListTrees()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var domain = ResolveDomain(user);
        var trees = await _treeRepo.GetByDomainAsync(domain);
        return Ok(trees.Select(ToTreeResponse));
    }

    // ── POST /api/family ────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateTree([FromBody] CreateFamilyTreeRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var tree = new FamilyTree
        {
            Id = $"ftree_{Guid.NewGuid():N}",
            Name = req.Name,
            Surname = req.Surname,
            OwnerId = user.Id,
            Domain = ResolveDomain(user),
            RootGeneration = req.RootGeneration,
            ZibeiPoem = req.ZibeiPoem ?? new List<string>()
        };

        await _treeRepo.CreateAsync(tree);
        return Ok(ToTreeResponse(tree));
    }

    // ── GET  /api/family/{treeId} ───────────────────────────────────────────
    [HttpGet("{treeId}")]
    public async Task<IActionResult> GetTree(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        var persons = await _personRepo.GetByTreeIdAsync(treeId);
        var rels = await _relRepo.GetByTreeIdAsync(treeId);

        return Ok(new FullFamilyTreeResponse
        {
            Tree = ToTreeResponse(tree),
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
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        if (req.Name != null) tree.Name = req.Name;
        if (req.Surname != null) tree.Surname = req.Surname;
        if (req.RootGeneration.HasValue) tree.RootGeneration = req.RootGeneration.Value;
        if (req.ZibeiPoem != null) tree.ZibeiPoem = req.ZibeiPoem;

        await _treeRepo.UpdateAsync(tree);
        return Ok(ToTreeResponse(tree));
    }

    // ── DELETE /api/family/{treeId} ─────────────────────────────────────────
    [HttpDelete("{treeId}")]
    public async Task<IActionResult> DeleteTree(string treeId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        await _personRepo.DeleteByTreeIdAsync(treeId);
        await _relRepo.DeleteByTreeIdAsync(treeId);
        await _treeRepo.DeleteAsync(treeId);
        return Ok(new { message = "Tree deleted" });
    }

    // ── POST /api/family/{treeId}/persons ───────────────────────────────────
    [HttpPost("{treeId}/persons")]
    public async Task<IActionResult> AddPerson(string treeId, [FromBody] UpsertFamilyPersonRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        var person = new FamilyPerson
        {
            Id = $"fperson_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = tree.Domain,
            Name = req.Name ?? string.Empty,
            Gender = req.Gender ?? "male",
            Generation = req.Generation ?? tree.RootGeneration,
            Aliases = req.Aliases ?? new List<string>(),
            BirthDate = req.BirthDate == null ? null : new FamilyDate { Year = req.BirthDate.Year, Month = req.BirthDate.Month, Day = req.BirthDate.Day },
            DeathDate = req.DeathDate == null ? null : new FamilyDate { Year = req.DeathDate.Year, Month = req.DeathDate.Month, Day = req.DeathDate.Day },
            BirthPlace = req.BirthPlace,
            DeathPlace = req.DeathPlace,
            IsAlive = req.IsAlive,
            AvatarUrl = req.AvatarUrl,
            Photos = req.Photos?.Select(p => new FamilyPhoto { Id = p.Id, Url = p.Url, Caption = p.Caption, Year = p.Year }).ToList() ?? new(),
            Occupation = req.Occupation,
            Education = req.Education,
            Biography = req.Biography,
            Experiences = req.Experiences?.Select(e => new FamilyExperience { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList() ?? new()
        };

        await _personRepo.CreateAsync(person);
        return Ok(ToPersonResponse(person));
    }

    // ── PUT  /api/family/{treeId}/persons/{personId} ────────────────────────
    [HttpPut("{treeId}/persons/{personId}")]
    public async Task<IActionResult> UpdatePerson(string treeId, string personId, [FromBody] UpsertFamilyPersonRequest req)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var person = await _personRepo.GetByIdAsync(personId);
        if (person == null || person.TreeId != treeId) return NotFound();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null || !IsSameDomain(user, tree.Domain)) return Forbid();

        if (req.Name != null) person.Name = req.Name;
        if (req.Gender != null) person.Gender = req.Gender;
        if (req.Generation.HasValue) person.Generation = req.Generation.Value;
        if (req.Aliases != null) person.Aliases = req.Aliases;
        if (req.BirthDate != null) person.BirthDate = new FamilyDate { Year = req.BirthDate.Year, Month = req.BirthDate.Month, Day = req.BirthDate.Day };
        if (req.DeathDate != null) person.DeathDate = new FamilyDate { Year = req.DeathDate.Year, Month = req.DeathDate.Month, Day = req.DeathDate.Day };
        if (req.BirthPlace != null) person.BirthPlace = req.BirthPlace;
        if (req.DeathPlace != null) person.DeathPlace = req.DeathPlace;
        if (req.IsAlive.HasValue) person.IsAlive = req.IsAlive;
        if (req.AvatarUrl != null) person.AvatarUrl = req.AvatarUrl;
        if (req.Photos != null) person.Photos = req.Photos.Select(p => new FamilyPhoto { Id = p.Id, Url = p.Url, Caption = p.Caption, Year = p.Year }).ToList();
        if (req.Occupation != null) person.Occupation = req.Occupation;
        if (req.Education != null) person.Education = req.Education;
        if (req.Biography != null) person.Biography = req.Biography;
        if (req.Experiences != null) person.Experiences = req.Experiences.Select(e => new FamilyExperience { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList();

        await _personRepo.UpdateAsync(person);
        return Ok(ToPersonResponse(person));
    }

    // ── DELETE /api/family/{treeId}/persons/{personId} ──────────────────────
    [HttpDelete("{treeId}/persons/{personId}")]
    public async Task<IActionResult> DeletePerson(string treeId, string personId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var person = await _personRepo.GetByIdAsync(personId);
        if (person == null || person.TreeId != treeId) return NotFound();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null || !IsSameDomain(user, tree.Domain)) return Forbid();

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
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        var rel = new FamilyRelationship
        {
            Id = $"frel_{Guid.NewGuid():N}",
            TreeId = treeId,
            Domain = tree.Domain,
            Type = req.Type,
            FromId = req.FromId,
            ToId = req.ToId,
            ParentRole = req.ParentRole,
            ChildStatus = req.ChildStatus,
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
        if (!user.IsAdmin) return Forbid();

        var rel = await _relRepo.GetByIdAsync(relId);
        if (rel == null || rel.TreeId != treeId) return NotFound();

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
        if (!user.IsAdmin) return Forbid();

        var rel = await _relRepo.GetByIdAsync(relId);
        if (rel == null || rel.TreeId != treeId) return NotFound();

        await _relRepo.DeleteAsync(relId);
        return Ok(new { message = "Relationship deleted" });
    }

    // ── POST /api/family/{treeId}/import ────────────────────────────────────
    [HttpPost("{treeId}/import")]
    public async Task<IActionResult> ImportTree(string treeId, [FromBody] NestedPersonImport root)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

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
        if (!user.IsAdmin) return Forbid();

        var tree = await _treeRepo.GetByIdAsync(treeId);
        if (tree == null) return NotFound();
        if (!IsSameDomain(user, tree.Domain)) return Forbid();

        var persons = await _personRepo.GetByTreeIdAsync(treeId);
        var rels = await _relRepo.GetByTreeIdAsync(treeId);

        var export = new FullFamilyTreeResponse
        {
            Tree = ToTreeResponse(tree),
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

    private static string ResolveDomain(User user)
        => string.IsNullOrWhiteSpace(user.Domain) ? DomainRules.GetDomain(user.Email) : user.Domain;

    private bool IsSameDomain(User user, string domain)
    {
        if (DomainRules.IsSuperDomain(ResolveDomain(user))) return true;
        return string.Equals(ResolveDomain(user), domain, StringComparison.OrdinalIgnoreCase);
    }

    private static FamilyTreeResponse ToTreeResponse(FamilyTree t) => new()
    {
        Id = t.Id, Name = t.Name, Surname = t.Surname, Domain = t.Domain,
        OwnerId = t.OwnerId, RootGeneration = t.RootGeneration, ZibeiPoem = t.ZibeiPoem,
        CreatedAt = t.CreatedAt.ToString("o"), UpdatedAt = t.UpdatedAt.ToString("o")
    };

    private static FamilyPersonResponse ToPersonResponse(FamilyPerson p) => new()
    {
        Id = p.Id, TreeId = p.TreeId, Name = p.Name, Aliases = p.Aliases,
        Gender = p.Gender, Generation = p.Generation,
        BirthDate = p.BirthDate == null ? null : new FamilyDateDto { Year = p.BirthDate.Year, Month = p.BirthDate.Month, Day = p.BirthDate.Day },
        DeathDate = p.DeathDate == null ? null : new FamilyDateDto { Year = p.DeathDate.Year, Month = p.DeathDate.Month, Day = p.DeathDate.Day },
        BirthPlace = p.BirthPlace, DeathPlace = p.DeathPlace, IsAlive = p.IsAlive,
        AvatarUrl = p.AvatarUrl,
        Photos = p.Photos.Select(ph => new FamilyPhotoDto { Id = ph.Id, Url = ph.Url, Caption = ph.Caption, Year = ph.Year }).ToList(),
        Occupation = p.Occupation, Education = p.Education, Biography = p.Biography,
        Experiences = p.Experiences.Select(e => new FamilyExperienceDto { Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, StartYear = e.StartYear, EndYear = e.EndYear }).ToList()
    };

    private static FamilyRelationshipResponse ToRelResponse(FamilyRelationship r) => new()
    {
        Id = r.Id, Type = r.Type, FromId = r.FromId, ToId = r.ToId,
        ParentRole = r.ParentRole, ChildStatus = r.ChildStatus, SortOrder = r.SortOrder,
        UnionType = r.UnionType, StartYear = r.StartYear, EndYear = r.EndYear, Notes = r.Notes
    };

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
            Gender = "male",
            Generation = generation
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
                Gender = "female",
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
}
