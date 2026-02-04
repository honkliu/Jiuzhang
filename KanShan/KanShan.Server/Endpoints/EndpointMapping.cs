namespace KanShan.Server.Endpoints;

public static class EndpointMapping
{
    public static IEndpointRouteBuilder MapApi(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        api.MapAuthEndpoints();
        api.MapUserEndpoints();
        api.MapChatEndpoints();
        api.MapUploadEndpoints();
        api.MapPresenceEndpoints();

        return app;
    }
}
