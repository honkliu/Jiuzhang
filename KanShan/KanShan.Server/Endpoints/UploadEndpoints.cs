using KanShan.Server.Storage;

namespace KanShan.Server.Endpoints;

public static class UploadEndpoints
{
    public static RouteGroupBuilder MapUploadEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/uploads").RequireAuthorization();

        group.MapPost("/image", UploadImageAsync);

        return group;
    }

    private static async Task<IResult> UploadImageAsync(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType)
        {
            return Results.BadRequest(new { error = "Expected multipart/form-data" });
        }

        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is null)
        {
            return Results.BadRequest(new { error = "Missing file field named 'file'" });
        }

        try
        {
            var (publicUrl, relativePath) = await storage.SaveImageAsync(file, cancellationToken);
            return Results.Ok(new { url = publicUrl, path = relativePath });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }
}
