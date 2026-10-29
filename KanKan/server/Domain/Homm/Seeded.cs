namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// The three seats of a game (faction, city and starting hero). Seat i of every game uses entry i;
/// the players themselves are Kankan users (Player.UserId).
/// </summary>
public record SeededPlayer(string Id, string Name, string Faction, string CityName, string HeroKey);

public static class Seeded
{
    public static readonly SeededPlayer[] Players =
    [
        new("alice", "Alice", "castle", "Steadwick", "christian"),
        new("bob", "Bob", "rampart", "AvLee", "ryland"),
        new("carol", "Carol", "necropolis", "Deyja", "vidomina")
    ];
}