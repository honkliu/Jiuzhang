using System.Text.Json;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// The social layer: peaceful encounters, hero meetings, voluntary trades,
/// shared projects, map annotations, and Tower content.
/// </summary>
public class SocialService
{
    private readonly HommDb _db;
    public SocialService(HommDb db) => _db = db;

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ---------------------------------------------------------------- encounters
    public record EncounterState(string Creature, int Count, int X, int Y);
    public record EncounterOffer(string Creature, string Name, int Count, int Gold, bool CanRecruit);

    public static EncounterOffer? GetEncounterOffer(Hero hero)
    {
        if (string.IsNullOrEmpty(hero.PendingEncounterJson)) return null;
        EncounterState? encounter;
        try { encounter = JsonSerializer.Deserialize<EncounterState>(hero.PendingEncounterJson, Json); }
        catch (JsonException) { return null; }
        if (encounter == null || string.IsNullOrEmpty(encounter.Creature) || encounter.Count <= 0
            || !Creatures.All.TryGetValue(encounter.Creature, out var creature)) return null;
        return new EncounterOffer(encounter.Creature, creature.Name, encounter.Count,
            Encounters.RecruitCost(creature.Gold, encounter.Count),
            Encounters.CanRecruit(Encounters.Strength(hero.ArmyJson), Encounters.StackStrength(creature.AiValue, encounter.Count)));
    }

    /// <summary>Resolve a peaceful encounter with a wandering monster stack.</summary>
    public async Task<(bool ok, string? error, string? message)> ResolveEncounterAsync(
        Guid heroId, string playerId, string action)
    {
        var hero = await _db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return (false, "Hero not found.", null);

        var player = await _db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (player.UserId == null || player.UserId != playerId) return (false, "Not your hero.", null);

        if (string.IsNullOrEmpty(hero.PendingEncounterJson))
            return (false, "There is no encounter here.", null);

        var enc = JsonSerializer.Deserialize<EncounterState>(hero.PendingEncounterJson, Json);
        if (enc == null) return (false, "There is no encounter here.", null);

        var game = await _db.Games.FirstAsync(g => g.Id == hero.GameId);
        if (game.State != GameState.InProgress) return (false, "The game is not in progress.", null);
        var map = JsonSerializer.Deserialize<AdventureMap>(game.MapJson, Json);
        if (map == null) return (false, "Map not found.", null);

        var tile = map.At(enc.X, enc.Y);
        var creature = Creatures.All.TryGetValue(enc.Creature, out var c) ? c : null;

        switch (action)
        {
            case "observe":
            {
                if (creature != null)
                {
                    var mine = Encounters.Strength(hero.ArmyJson);
                    var theirs = Encounters.StackStrength(creature.AiValue, enc.Count);
                    if (!Encounters.CanObserve(mine, theirs))
                        return (false, $"Your expedition is too weak to approach {enc.Count} {creature.Name}.", null);
                }
                var xp = creature != null ? Encounters.ObserveReward(creature.AiValue, enc.Count) : 10;
                GameService.GainExperience(hero, xp);
                hero.PendingEncounterJson = null;
                await _db.SaveChangesAsync();
                return (true, null, $"You observe the {creature?.Name ?? enc.Creature}. +{xp} experience.");
            }
            case "recruit":
            {
                if (creature == null) return (false, "Unknown creature.", null);
                var mine = Encounters.Strength(hero.ArmyJson);
                var theirs = Encounters.StackStrength(creature.AiValue, enc.Count);
                if (!Encounters.CanRecruit(mine, theirs))
                    return (false, $"Your expedition ({mine}) is weaker than the stack ({theirs}); they will not join you.", null);
                var cost = Encounters.RecruitCost(creature.Gold, enc.Count);
                if (player.Gold < cost) return (false, $"Not enough gold ({cost} needed).", null);

                var army = GameService.ParseArmy(hero.ArmyJson);
                if (!GameService.AddToArmy(army, enc.Creature, enc.Count))
                    return (false, "Your army is full.", null);

                player.Gold -= cost;
                hero.ArmyJson = GameService.SerializeArmy(army);
                var effects = GameService.Effects(hero);
                hero.MaxMovement = GameService.MaxMovement(hero) + (TownRules.StabledThisWeek(hero, game) ? 400 : 0)
                    + (effects.HasteTurn == game.CurrentTurn ? effects.HasteBonus : 0);
                hero.PendingEncounterJson = null;
                tile.ObjectKind = null;
                tile.ObjectData = null;
                tile.Passable = true;
                game.MapJson = JsonSerializer.Serialize(map, Json);
                await _db.SaveChangesAsync();
                return (true, null, $"Recruited {enc.Count} {creature.Name} for {cost} gold.");
            }
            case "pass":
            {
                hero.PendingEncounterJson = null;
                await _db.SaveChangesAsync();
                return (true, null, "You pass by.");
            }
            default:
                return (false, "Unknown action.", null);
        }
    }

    // ---------------------------------------------------------------- hero meetings
    public async Task<(bool ok, string? error)> SendHeroMessageAsync(
        Guid gameId, string fromPlayerId, Guid toPlayerId, string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return (false, "Message cannot be empty.");
        if (body.Length > 2000) return (false, "Message must be at most 2000 characters.");

        var from = await PlayerByUserAsync(gameId, fromPlayerId);
        if (from == null) return (false, "Unknown player.");
        if (!await IsActive(gameId)) return (false, "The game is not in progress.");
        if (!await _db.Players.AnyAsync(p => p.Id == toPlayerId && p.GameId == gameId))
            return (false, "Recipient not found.");

        _db.HeroMessages.Add(new HeroMessage
        {
            GameId = gameId,
            FromPlayerId = from.Id,
            ToPlayerId = toPlayerId,
            Body = body.Trim()
        });
        await _db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<List<object>> GetHeroMessagesAsync(Guid gameId, string playerId)
    {
        var me = await PlayerByUserAsync(gameId, playerId);
        if (me == null) return [];

        var msgs = await _db.HeroMessages
            .Where(m => m.GameId == gameId && (m.ToPlayerId == me.Id || m.FromPlayerId == me.Id))
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        var players = await _db.Players.Where(p => p.GameId == gameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";

        return msgs.Select(m => (object)new
        {
            id = m.Id,
            from = NameOf(m.FromPlayerId),
            to = NameOf(m.ToPlayerId),
            body = m.Body,
            createdAt = m.CreatedAt,
            mine = m.FromPlayerId == me.Id
        }).ToList();
    }

    // ---------------------------------------------------------------- trades
    public async Task<(bool ok, string? error)> OfferTradeAsync(
        Guid gameId, string fromPlayerId, Guid toPlayerId,
        string give, int giveAmount, string want, int wantAmount)
    {
        if (giveAmount <= 0 || wantAmount <= 0) return (false, "Amounts must be positive.");
        if (give == want) return (false, "Cannot trade a resource for itself.");
        if (!TownRules.IsResource(give) || !TownRules.IsResource(want)) return (false, "Unknown resource.");

        var from = await PlayerByUserAsync(gameId, fromPlayerId);
        if (from == null) return (false, "Unknown player.");
        if (!await IsActive(gameId)) return (false, "The game is not in progress.");
        if (toPlayerId == from.Id || !await _db.Players.AnyAsync(p => p.Id == toPlayerId && p.GameId == gameId))
            return (false, "Choose another player in this game.");
        if (GetRes(from, give) < giveAmount) return (false, "You do not have that much " + give + ".");

        _db.TradeOffers.Add(new TradeOffer
        {
            GameId = gameId,
            FromPlayerId = from.Id,
            ToPlayerId = toPlayerId,
            GiveResource = give,
            GiveAmount = giveAmount,
            WantResource = want,
            WantAmount = wantAmount
        });
        await _db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool ok, string? error)> RespondTradeAsync(
        Guid offerId, string playerId, bool accept)
    {
        var offer = await _db.TradeOffers.FirstOrDefaultAsync(o => o.Id == offerId);
        if (offer == null) return (false, "Offer not found.");
        if (offer.Status != "pending") return (false, "That offer is no longer pending.");

        var me = await PlayerByUserAsync(offer.GameId, playerId);
        if (me == null || me.Id != offer.ToPlayerId) return (false, "This offer is not for you.");
        if (!await IsActive(offer.GameId)) return (false, "The game is not in progress.");

        if (!accept)
        {
            offer.Status = "declined";
            await _db.SaveChangesAsync();
            return (true, null);
        }

        var from = await _db.Players.FirstAsync(p => p.Id == offer.FromPlayerId);
        if (GetRes(from, offer.GiveResource) < offer.GiveAmount)
            return (false, "The other player no longer has that resource.");
        if (GetRes(me, offer.WantResource) < offer.WantAmount)
            return (false, "You do not have enough " + offer.WantResource + ".");
        if ((long)GetRes(me, offer.GiveResource) + offer.GiveAmount > int.MaxValue
            || (long)GetRes(from, offer.WantResource) + offer.WantAmount > int.MaxValue)
            return (false, "That trade would exceed the resource limit.");

        SetRes(from, offer.GiveResource, GetRes(from, offer.GiveResource) - offer.GiveAmount);
        SetRes(me, offer.GiveResource, GetRes(me, offer.GiveResource) + offer.GiveAmount);
        SetRes(me, offer.WantResource, GetRes(me, offer.WantResource) - offer.WantAmount);
        SetRes(from, offer.WantResource, GetRes(from, offer.WantResource) + offer.WantAmount);

        offer.Status = "accepted";
        await _db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<List<object>> GetTradesAsync(Guid gameId, string playerId)
    {
        var me = await PlayerByUserAsync(gameId, playerId);
        if (me == null) return [];

        var offers = await _db.TradeOffers
            .Where(o => o.GameId == gameId && (o.ToPlayerId == me.Id || o.FromPlayerId == me.Id))
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        var players = await _db.Players.Where(p => p.GameId == gameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";

        return offers.Select(o => (object)new
        {
            id = o.Id,
            from = NameOf(o.FromPlayerId),
            to = NameOf(o.ToPlayerId),
            give = o.GiveResource,
            giveAmount = o.GiveAmount,
            want = o.WantResource,
            wantAmount = o.WantAmount,
            status = o.Status,
            incoming = o.ToPlayerId == me.Id,
            createdAt = o.CreatedAt
        }).ToList();
    }

    // ---------------------------------------------------------------- shared projects
    public async Task<List<object>> GetProjectsAsync(Guid gameId)
    {
        var projects = await _db.SharedProjects.Where(p => p.GameId == gameId).ToListAsync();
        return projects.Select(p => (object)new
        {
            id = p.Id,
            name = p.Name,
            description = p.Description,
            requiredGold = p.RequiredGold,
            requiredWood = p.RequiredWood,
            requiredOre = p.RequiredOre,
            contributedGold = p.ContributedGold,
            contributedWood = p.ContributedWood,
            contributedOre = p.ContributedOre,
            completed = p.Completed,
            contributors = GameService.ParseStringArray(p.ContributorsJson)
        }).ToList();
    }

    public async Task<(bool ok, string? error)> ContributeAsync(
        Guid projectId, string playerId, int gold, int wood, int ore)
    {
        var project = await _db.SharedProjects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project == null) return (false, "Project not found.");
        if (project.Completed) return (false, "That project is already complete.");

        var me = await PlayerByUserAsync(project.GameId, playerId);
        if (me == null) return (false, "Unknown player.");
        if (!await IsActive(project.GameId)) return (false, "The game is not in progress.");

        if (gold < 0 || wood < 0 || ore < 0) return (false, "Amounts must not be negative.");
        if ((long)project.ContributedGold + gold > int.MaxValue || (long)project.ContributedWood + wood > int.MaxValue
            || (long)project.ContributedOre + ore > int.MaxValue) return (false, "That contribution is too large.");
        if (GetRes(me, "gold") < gold || GetRes(me, "wood") < wood || GetRes(me, "ore") < ore)
            return (false, "Not enough resources.");

        SetRes(me, "gold", GetRes(me, "gold") - gold);
        SetRes(me, "wood", GetRes(me, "wood") - wood);
        SetRes(me, "ore", GetRes(me, "ore") - ore);

        project.ContributedGold += gold;
        project.ContributedWood += wood;
        project.ContributedOre += ore;

        var contributors = GameService.ParseStringArray(project.ContributorsJson).ToList();
        if (!contributors.Contains(me.Id.ToString())) contributors.Add(me.Id.ToString());
        project.ContributorsJson = JsonSerializer.Serialize(contributors, Json);

        if (project.ContributedGold >= project.RequiredGold &&
            project.ContributedWood >= project.RequiredWood &&
            project.ContributedOre >= project.RequiredOre)
        {
            project.Completed = true;
            await GrantProjectRewardAsync(project, contributors);
        }

        await _db.SaveChangesAsync();
        return (true, null);
    }

    private async Task GrantProjectRewardAsync(SharedProject project, List<string> contributorIds)
    {
        var ids = contributorIds.Select(Guid.Parse).ToList();
        switch (project.Name)
        {
            case SharedProjectCatalog.Festival:
            {
                var heroes = await _db.Heroes.Where(h => ids.Contains(h.PlayerId)).ToListAsync();
                foreach (var h in heroes) GameService.GainExperience(h, SharedProjectCatalog.FestivalExperience);
                break;
            }
            case SharedProjectCatalog.Lighthouse:
            {
                var game = await _db.Games.FirstAsync(g => g.Id == project.GameId);
                var players = await _db.Players.Where(p => ids.Contains(p.Id)).ToListAsync();
                foreach (var p in players)
                {
                    var fog = GameService.ParseFog(p.FogJson, game.MapWidth * game.MapHeight);
                    for (var i = 0; i < fog.Length; i++) if (fog[i] == 0) fog[i] = 1;
                    p.FogJson = GameService.SerializeFog(fog);
                }
                break;
            }
            // Caravan Road pays out daily in GameService.TickAsync.
        }
    }

    // ---------------------------------------------------------------- annotations
    public async Task<(bool ok, string? error)> AddAnnotationAsync(
        Guid gameId, string playerId, int x, int y, string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (false, "Annotation cannot be empty.");
        if (text.Length > 200) return (false, "Annotation must be at most 200 characters.");

        var me = await PlayerByUserAsync(gameId, playerId);
        if (me == null) return (false, "Unknown player.");
        if (!await IsActive(gameId)) return (false, "The game is not in progress.");

        _db.MapAnnotations.Add(new MapAnnotation
        {
            GameId = gameId,
            AuthorPlayerId = me.Id,
            X = x,
            Y = y,
            Text = text.Trim()
        });
        await _db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<List<object>> GetAnnotationsAsync(Guid gameId)
    {
        var list = await _db.MapAnnotations.Where(a => a.GameId == gameId).OrderBy(a => a.CreatedAt).ToListAsync();
        var players = await _db.Players.Where(p => p.GameId == gameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";

        return list.Select(a => (object)new
        {
            id = a.Id, x = a.X, y = a.Y, text = a.Text,
            author = NameOf(a.AuthorPlayerId), createdAt = a.CreatedAt
        }).ToList();
    }

    // ---------------------------------------------------------------- tower content
    public async Task<(Guid? id, string? error)> CreatePostAsync(
        Guid townId, string playerId, string title, string body, string? imageUrl)
    {
        var town = await _db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return (null, "Town not found.");

        var me = await PlayerByUserAsync(town.GameId, playerId);
        if (me == null || me.Id != town.PlayerId) return (null, "You can only write in your own Tower.");

        if (string.IsNullOrWhiteSpace(title)) return (null, "Title is required.");
        if (title.Length > 120) return (null, "Title must be at most 120 characters.");
        if (body.Length > 20000) return (null, "Body must be at most 20000 characters.");

        var built = GameService.ParseStringArray(town.BuildingsJson);
        var slots = TowerSlots(built);
        if (slots == 0) return (null, "This town has no Magic Tower yet.");

        var count = await _db.Posts.CountAsync(p => p.TownId == townId);
        if (count >= slots) return (null, $"Your Tower holds {slots} posts. Upgrade it to write more.");

        var post = new Post
        {
            GameId = town.GameId,
            TownId = townId,
            Title = title.Trim(),
            Body = body,
            ImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl.Trim()
        };
        _db.Posts.Add(post);
        await _db.SaveChangesAsync();
        return (post.Id, null);
    }

    public static int TowerSlots(IEnumerable<string> built)
    {
        var set = built.ToHashSet();
        if (set.Contains("mageGuild5")) return 25;
        if (set.Contains("mageGuild4")) return 15;
        if (set.Contains("mageGuild3")) return 10;
        if (set.Contains("mageGuild2")) return 6;
        if (set.Contains("mageGuild1")) return 3;
        return 0;
    }

    private Task<bool> IsActive(Guid gameId) =>
        _db.Games.AnyAsync(g => g.Id == gameId && g.State == GameState.InProgress);

    public async Task<(Guid? id, string? error)> AddWallMessageAsync(
        Guid townId, string playerId, string body, Guid? parentId)
    {
        if (string.IsNullOrWhiteSpace(body)) return (null, "Message cannot be empty.");
        if (body.Length > 2000) return (null, "Message must be at most 2000 characters.");

        var town = await _db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return (null, "Town not found.");

        var me = await PlayerByUserAsync(town.GameId, playerId);
        if (me == null) return (null, "Unknown player.");

        var m = new WallMessage { GameId = town.GameId, TownId = townId, AuthorUserId = me.Id, Body = body.Trim(), ParentId = parentId };
        _db.WallMessages.Add(m);
        await _db.SaveChangesAsync();
        return (m.Id, null);
    }

    public async Task<(Guid? id, string? error)> AddTowerMessageAsync(Guid townId, string playerId, string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return (null, "Message cannot be empty.");
        if (body.Length > 2000) return (null, "Message must be at most 2000 characters.");

        var town = await _db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return (null, "Town not found.");

        var me = await PlayerByUserAsync(town.GameId, playerId);
        if (me == null) return (null, "Unknown player.");

        var m = new TowerMessage { GameId = town.GameId, TownId = townId, AuthorUserId = me.Id, Body = body.Trim() };
        _db.TowerMessages.Add(m);
        await _db.SaveChangesAsync();
        return (m.Id, null);
    }

    public async Task<(Guid? id, string? error)> AddCommentAsync(Guid postId, string playerId, string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return (null, "Message cannot be empty.");
        if (body.Length > 2000) return (null, "Message must be at most 2000 characters.");

        var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == postId);
        if (post == null) return (null, "Post not found.");
        var town = await _db.Towns.FirstAsync(t => t.Id == post.TownId);

        var me = await PlayerByUserAsync(town.GameId, playerId);
        if (me == null) return (null, "Unknown player.");

        var c = new Comment { GameId = town.GameId, PostId = postId, AuthorUserId = me.Id, Body = body.Trim() };
        _db.Comments.Add(c);
        await _db.SaveChangesAsync();
        return (c.Id, null);
    }

    // ---------------------------------------------------------------- helpers
    private async Task<Player?> PlayerByUserAsync(Guid gameId, string playerId)
    {
        if (string.IsNullOrEmpty(playerId)) return null;
        return await _db.Players.FirstOrDefaultAsync(p => p.GameId == gameId && p.UserId == playerId);
    }

    private static int GetRes(Player p, string r) => r switch
    {
        "wood" => p.Wood, "ore" => p.Ore, "mercury" => p.Mercury,
        "sulfur" => p.Sulfur, "crystal" => p.Crystal, "gems" => p.Gems,
        "gold" => p.Gold, _ => 0
    };

    private static void SetRes(Player p, string r, int v)
    {
        switch (r)
        {
            case "wood": p.Wood = v; break;
            case "ore": p.Ore = v; break;
            case "mercury": p.Mercury = v; break;
            case "sulfur": p.Sulfur = v; break;
            case "crystal": p.Crystal = v; break;
            case "gems": p.Gems = v; break;
            case "gold": p.Gold = v; break;
        }
    }
}