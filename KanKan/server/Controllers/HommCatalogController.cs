using System.Text.Json;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Repositories.Homm;
using KanKan.API.Services.Homm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using static KanKan.API.Controllers.Homm.HommApi;

namespace KanKan.API.Controllers.Homm;

/// <summary>HoMM game API (ported from City of Towers): catalog routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommCatalogController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    [HttpGet("buildings")]
    public IResult GetBuildings([FromQuery] string? faction)
    {
        return Results.Ok(TownBuildings.For(faction ?? "castle").Values.Select(b => new
    {
        key = b.Key, name = b.Name, category = b.Category,
        cost = new { gold = b.Gold, wood = b.Wood, ore = b.Ore, mercury = b.Mercury, sulfur = b.Sulfur, crystal = b.Crystal, gems = b.Gems },
        requires = b.Requires, description = b.Description, tier = b.Tier
    }));
    }

    [HttpGet("creatures")]
    public IResult GetCreatures()
    {
        return Results.Ok(Creatures.All.Values.Select(c => new
    {
        key = c.Key, name = c.Name, faction = c.Faction, tier = c.Tier,
        attack = c.Attack, defense = c.Defense, damageMin = c.DamageMin, damageMax = c.DamageMax,
        health = c.Health, speed = c.Speed, growth = c.Growth, gold = c.Gold, shots = c.Shots,
        cost = TownRules.CostOf(c),
        aiValue = c.AiValue, abilities = c.Abilities, upgradeOf = c.UpgradeOf
    }));
    }

    [HttpGet("heroes")]
    public IResult GetHeroes()
    {
        return Results.Ok(Heroes.All.Values.Select(h => new
    {
        key = h.Key, name = h.Name, faction = h.Faction, might = h.Might,
        attack = h.Attack, defense = h.Defense, power = h.Power, knowledge = h.Knowledge,
        skills = h.Skills
    }));
    }

    [HttpGet("spells")]
    public IResult GetSpells()
    {
        return Results.Ok(Spells.All.Values.Select(s => new
    {
        key = s.Key, name = s.Name, level = s.Level, school = s.School,
        cost = s.Cost, description = s.Description, id = s.Id, manaCosts = s.ManaCosts, adventure = s.Adventure
    }));
    }
}
