namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// A peaceful encounter with a wandering monster stack. There is no combat:
/// the player may observe (gain experience), recruit (pay gold), or pass.
/// </summary>
public record EncounterOption(string Kind, string Label, string Description, int Cost, int Reward);

public static class Encounters
{
    /// <summary>Experience gained for observing a stack.</summary>
    public static int ObserveReward(int aiValue, int count) => Math.Max(10, aiValue * count / 20);

    /// <summary>Gold cost to recruit a stack.</summary>
    public static int RecruitCost(int gold, int count) => gold * count;

    /// <summary>Whether the hero's army has room for another stack.</summary>
    public static bool HasRoom(string armyJson)
    {
        var slots = GameService.ParseArmy(armyJson);
        return slots.Any(s => s.Creature == null);
    }

    /// <summary>
    /// Expedition strength: the army's total AI value. A stack can be observed when the
    /// army is at least half its strength, and recruited when it is at least as strong.
    /// </summary>
    public static int Strength(string armyJson) =>
        GameService.ArmyStrength(GameService.ParseArmy(armyJson));

    public static int StackStrength(int aiValue, int count) => aiValue * count;

    public static bool CanObserve(int armyStrength, int stackStrength) => armyStrength * 2 >= stackStrength;

    public static bool CanRecruit(int armyStrength, int stackStrength) => armyStrength >= stackStrength;
}
