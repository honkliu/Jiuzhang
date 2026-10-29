using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using KanKan.API.Repositories.Homm;
using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models.Entities.Homm;

public enum GameState { Waiting, InProgress, Finished }

public class Game
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(60)] public string Name { get; set; } = "";
    /// <summary>Kankan user id of the player who created the game.</summary>
    public string? HostUserId { get; set; }
    public int Capacity { get; set; } = 3;
    public int TurnSeconds { get; set; } = 300;
    public int TurnLimit { get; set; } = 60;
    public GameState State { get; set; } = GameState.Waiting;

    public int Day { get; set; } = 1;
    public int Week { get; set; } = 1;
    public int Month { get; set; } = 1;
    public int CurrentTurn { get; set; } = 1;

    public DateTime TurnStartedAt { get; set; } = DateTime.UtcNow;
    public Guid? WinnerUserId { get; set; }
    public string EndAgreementJson { get; set; } = "[]";

    public int MapWidth { get; set; } = 72;
    public int MapHeight { get; set; } = 72;
    [BsonSerializer(typeof(HommCompressedStringSerializer))]
    public string MapJson { get; set; } = "";

    public int RiddleId { get; set; }
    public string PuzzleAnswerHash { get; set; } = "";
    public string FragmentsJson { get; set; } = "[]";
    public int GrailX { get; set; } = -1;
    public int GrailY { get; set; } = -1;
    public bool GrailRevealed { get; set; }
    public bool GrailFound { get; set; }
    public Guid? GrailFinderPlayerId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Optimistic concurrency token: incremented on every save of the game document.</summary>
    public long Version { get; set; }

    // The game is stored as one MongoDB document; these are its embedded child collections.
    [JsonIgnore] public List<Player> Players { get; set; } = [];
    [JsonIgnore] public List<Hero> Heroes { get; set; } = [];
    [JsonIgnore] public List<Town> Towns { get; set; } = [];
    [JsonIgnore] public List<SharedProject> SharedProjects { get; set; } = [];
    [JsonIgnore] public List<TradeOffer> TradeOffers { get; set; } = [];
}

public class Player
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    /// <summary>Kankan user id seated here; null = open seat, "ai:{seat}" = computer player.</summary>
    public string? UserId { get; set; }
    public string DisplayName { get; set; } = "";
    /// <summary>Index into Seeded.Players; also the owner index used on the map.</summary>
    public int Seat { get; set; }
    [MaxLength(20)] public string Faction { get; set; } = "castle";
    [MaxLength(40)] public string CityName { get; set; } = "";
    public bool Precious { get; set; }
    /// <summary>Computer-controlled seat: the turn ticker plays it.</summary>
    public bool IsAi { get; set; }
    public int ObeliskVisits { get; set; }
    public bool BuiltThisTurn { get; set; }
    public int WrongAnswers { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public int Wood { get; set; }
    public int Ore { get; set; }
    public int Mercury { get; set; }
    public int Sulfur { get; set; }
    public int Crystal { get; set; }
    public int Gems { get; set; }
    public int Gold { get; set; }

    [BsonSerializer(typeof(HommCompressedStringSerializer))]
    public string FogJson { get; set; } = "";
    public string MineRemaindersJson { get; set; } = "{}";
    /// <summary>Obelisk tiles ("x,y") this player's heroes have visited; each uncovers part of the puzzle map.</summary>
    public string ObelisksVisitedJson { get; set; } = "[]";
}

public class Hero
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid PlayerId { get; set; }
    [MaxLength(30)] public string HeroKey { get; set; } = "";
    [MaxLength(30)] public string Name { get; set; } = "";
    [MaxLength(20)] public string Faction { get; set; } = "castle";

    public int Level { get; set; } = 1;
    public int Experience { get; set; }
    public int Attack { get; set; }
    public int Defense { get; set; }
    public int Power { get; set; }
    public int Knowledge { get; set; }

    public int Mana { get; set; }
    public int MaxMana { get; set; }
    public int Movement { get; set; }
    public int MaxMovement { get; set; }

    public int X { get; set; }
    public int Y { get; set; }

    public string ArmyJson { get; set; } = "[]";
    public string SkillsJson { get; set; } = "{}";
    public string SpellsJson { get; set; } = "[]";
    public string ArtifactsJson { get; set; } = "[]";
    public string ArtifactLayoutJson { get; set; } = "{}";
    public string? PendingLevelJson { get; set; }
    /// <summary>Set when the hero is standing on a monster tile awaiting a choice.</summary>
    public string? PendingEncounterJson { get; set; }
    public string? PendingTreasureJson { get; set; }
    public string AdventureEffectsJson { get; set; } = "{}";
}

public record TreasureChoice(int Gold, int Experience, int X, int Y);
public record AdventureNotice(string Kind, string Key, decimal Amount, string Message, int? Icon = null);
public record AdventureEffects(int FlightTurn = 0, int FlightPenalty = 0,
    int HasteTurn = 0, int HasteBonus = 0, int MovementPenalty = 0,
    int VisionsTurn = 0, int VisionsMastery = 0, int DoorTurn = 0, int DoorCasts = 0);

public class Town
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid PlayerId { get; set; }
    [MaxLength(40)] public string Name { get; set; } = "";
    [MaxLength(20)] public string Faction { get; set; } = "castle";
    public int X { get; set; }
    public int Y { get; set; }

    public string BuildingsJson { get; set; } = "[]";
    public string AvailableJson { get; set; } = "{}";
    public string GarrisonJson { get; set; } = "[]";
    public string TavernJson { get; set; } = "[]";
    public string MageGuildJson { get; set; } = "[]";
}

public class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid TownId { get; set; }
    [MaxLength(120)] public string Title { get; set; } = "";
    [MaxLength(20000)] public string Body { get; set; } = "";
    [MaxLength(500)] public string? ImageUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Comment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid PostId { get; set; }
    public Guid AuthorUserId { get; set; }
    [MaxLength(2000)] public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class WallMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid TownId { get; set; }
    public Guid AuthorUserId { get; set; }
    public Guid? ParentId { get; set; }
    [MaxLength(2000)] public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TowerMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid TownId { get; set; }
    public Guid AuthorUserId { get; set; }
    [MaxLength(2000)] public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ObeliskMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid AuthorUserId { get; set; }
    [MaxLength(2000)] public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A shared project: a monument any player may contribute to. When complete it
/// grants a benefit to every contributor. This replaces alliance warfare.
/// </summary>
public class SharedProject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int RequiredGold { get; set; }
    public int RequiredWood { get; set; }
    public int RequiredOre { get; set; }
    public int ContributedGold { get; set; }
    public int ContributedWood { get; set; }
    public int ContributedOre { get; set; }
    public bool Completed { get; set; }
    /// <summary>JSON array of player ids who contributed.</summary>
    public string ContributorsJson { get; set; } = "[]";
}

/// <summary>
/// A map annotation: a marker one player places for others to see.
/// </summary>
public class MapAnnotation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid AuthorPlayerId { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
    public string Text { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A message sent from one hero to another when they meet.
/// </summary>
public class HeroMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid FromPlayerId { get; set; }
    public Guid ToPlayerId { get; set; }
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A voluntary resource trade offered by one player to another.
/// </summary>
public class TradeOffer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameId { get; set; }
    public Guid FromPlayerId { get; set; }
    public Guid ToPlayerId { get; set; }
    public string GiveResource { get; set; } = "";
    public int GiveAmount { get; set; }
    public string WantResource { get; set; } = "";
    public int WantAmount { get; set; }
    /// <summary>pending | accepted | declined</summary>
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}