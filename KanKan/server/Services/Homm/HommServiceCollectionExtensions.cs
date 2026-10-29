using KanKan.API.Hubs;
using KanKan.API.Repositories.Homm;

namespace KanKan.API.Services.Homm;

/// <summary>Registration of the HoMM game (services, turn ticker, mutation lock, realtime hub).</summary>
public static class HommServiceCollectionExtensions
{
    public static IServiceCollection AddHomm(this IServiceCollection services, IConfiguration configuration)
    {
        HommBson.Register();
        services.AddScoped<HommDb>();
        services.AddScoped<GameService>();
        services.AddScoped<AiService>();
        services.AddScoped<SocialService>();
        services.AddSingleton<WsHub>();
        services.AddSingleton<RateLimiter>();
        services.AddSingleton<H3Assets>();
        services.AddHostedService<TurnTicker>();
        return services;
    }

    /// <summary>
    /// Serialises state-changing HoMM requests, as the original server did: every non-GET request under
    /// /api/homm, plus the GETs that refresh fog or visions, holds <see cref="GameService.MutationLock"/>.
    /// The turn ticker takes the same lock. Call before routing endpoints run.
    /// </summary>
    public static IApplicationBuilder UseHommMutationLock(this IApplicationBuilder app) =>
        app.Use(async (ctx, next) =>
        {
            var path = ctx.Request.Path.Value ?? "";
            var mutates = path.StartsWith("/api/homm/", StringComparison.OrdinalIgnoreCase)
                          && (!HttpMethods.IsGet(ctx.Request.Method)
                              || path.EndsWith("/map", StringComparison.OrdinalIgnoreCase)
                              || path.EndsWith("/visions", StringComparison.OrdinalIgnoreCase));
            if (!mutates)
            {
                await next();
                return;
            }
            await GameService.MutationLock.WaitAsync(ctx.RequestAborted);
            try { await next(); }
            finally { GameService.MutationLock.Release(); }
        });

    public static IEndpointRouteBuilder MapHomm(this IEndpointRouteBuilder app)
    {
        app.MapHub<HommHub>("/hub/homm");
        return app;
    }
}
