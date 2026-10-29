namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// The shared monuments seeded into every game. Rewards go to every contributor
/// when the project completes, so cooperation is the strongest move.
/// </summary>
public static class SharedProjectCatalog
{
    public const string Festival = "Festival of Banners";
    public const string Lighthouse = "Great Lighthouse";
    public const string CaravanRoad = "Caravan Road";

    public const int FestivalExperience = 1000;
    public const int CaravanGoldPerDay = 500;

    public static readonly (string Name, string Description, int Gold, int Wood, int Ore)[] All =
    [
        (Festival, $"A week of feasts. Each contributor's heroes gain {FestivalExperience} experience.", 3000, 5, 5),
        (Lighthouse, "A beacon on the coast. Each contributor's map is fully explored.", 2000, 10, 10),
        (CaravanRoad, $"A paved trade route. Each contributor earns +{CaravanGoldPerDay} gold per day.", 4000, 15, 15)
    ];

    public static IEnumerable<SharedProject> Seed(Guid gameId) => All.Select(p => new SharedProject
    {
        GameId = gameId,
        Name = p.Name,
        Description = p.Description,
        RequiredGold = p.Gold,
        RequiredWood = p.Wood,
        RequiredOre = p.Ore
    });
}
