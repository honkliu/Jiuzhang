using System.Text.Json;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


public record SkillChoice(string Key, int Level);
public record LevelChoice(int Level, int Primary, SkillChoice[] Choices);

public static class HeroProgression
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static LevelChoice? Pending(Hero hero) => hero.PendingLevelJson == null
        ? null : JsonSerializer.Deserialize<LevelChoice>(hero.PendingLevelJson, Json);

    public static void Advance(Hero hero)
    {
        if (hero.PendingLevelJson != null || hero.Level >= Experience.LevelFor(hero.Experience)) return;
        var profile = NativeRules.ClassOf(hero);
        var weights = hero.Level < 9 ? profile.Low : profile.High;
        var roll = Random.Shared.Next(weights.Sum());
        var primary = 0;
        while (roll >= weights[primary]) roll -= weights[primary++];
        switch (primary) { case 0: hero.Attack++; break; case 1: hero.Defense++; break; case 2: hero.Power++; break; default: hero.Knowledge++; break; }
        var skills = GameService.ParseSkills(hero.SkillsJson);
        skills["_wisdomOffer"] = skills.GetValueOrDefault("_wisdomOffer", 1) + 1;
        skills["_schoolOffer"] = skills.GetValueOrDefault("_schoolOffer", 1) + 1;
        var magic = profile.Name is "Cleric" or "Druid" or "Wizard" or "Heretic" or "Necromancer" or "Warlock" or "Battle Mage" or "Witch" or "Elementalist";
        string Select(List<string> candidates)
        {
            if (skills["_wisdomOffer"] >= (magic ? 3 : 6) && candidates.Contains("wisdom")) candidates = ["wisdom"];
            else if (skills["_schoolOffer"] >= (magic ? 3 : 4) && candidates.Any(k => k is "air" or "earth" or "fire" or "water"))
                candidates = candidates.Where(k => k is "air" or "earth" or "fire" or "water").ToList();
            var total = candidates.Sum(k => Math.Max(1, profile.Secondary.GetValueOrDefault(k)));
            var chance = Random.Shared.Next(total);
            var chosen = candidates[^1];
            foreach (var candidate in candidates)
            {
                chance -= Math.Max(1, profile.Secondary.GetValueOrDefault(candidate));
                if (chance < 0) { chosen = candidate; break; }
            }
            if (chosen == "wisdom") skills["_wisdomOffer"] = 0;
            if (chosen is "air" or "earth" or "fire" or "water") skills["_schoolOffer"] = 0;
            return chosen;
        }
        var upgrading = Skills.Adventure.Where(k => skills.GetValueOrDefault(k) is > 0 and < 3).ToList();
        var learning = skills.Count(kv => !kv.Key.StartsWith('_') && kv.Value > 0) < 8
            ? Skills.Adventure.Where(k => skills.GetValueOrDefault(k) <= 0 && profile.Secondary.GetValueOrDefault(k) > 0).ToList() : [];
        var offers = new List<SkillChoice>();
        var upgrades = Math.Max(1, 2 - learning.Count);
        while (offers.Count < upgrades && upgrading.Count > 0)
        {
            var skill = Select(upgrading); upgrading.Remove(skill); offers.Add(new(skill, skills[skill] + 1));
        }
        while (offers.Count < 2 && learning.Count > 0)
        {
            var skill = Select(learning); learning.Remove(skill); offers.Add(new(skill, 1));
        }
        hero.Level++;
        hero.SkillsJson = JsonSerializer.Serialize(skills, Json);
        hero.PendingLevelJson = JsonSerializer.Serialize(new LevelChoice(hero.Level, primary, offers.ToArray()), Json);
        hero.MaxMana = GameService.ManaCapacity(hero);
    }

    public static string? Choose(Hero hero, string? key)
    {
        var pending = Pending(hero);
        if (pending == null) return "There is no pending level-up.";
        var choice = pending.Choices.FirstOrDefault(c => c.Key == key);
        if (pending.Choices.Length > 0 && choice == null) return "Choose one of the offered skills.";
        if (choice != null)
        {
            var skills = GameService.ParseSkills(hero.SkillsJson);
            if (!skills.ContainsKey(choice.Key) && skills.Count(kv => !kv.Key.StartsWith('_') && kv.Value > 0) >= 8)
                return "A hero may have at most eight secondary skills.";
            skills[choice.Key] = choice.Level;
            hero.SkillsJson = JsonSerializer.Serialize(skills, Json);
        }
        hero.PendingLevelJson = null;
        hero.MaxMana = GameService.ManaCapacity(hero);
        Advance(hero);
        return null;
    }
}
